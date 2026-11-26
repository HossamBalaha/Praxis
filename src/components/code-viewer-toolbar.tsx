"use client";

import * as React from "react";
import {
    BookOpen,
    Box,
    Check,
    ChevronDown,
    Copy,
    Download,
    ExternalLink,
    FlaskConical,
    FolderOpen,
    FunctionSquare,
    Loader2,
    Palette,
    Pencil,
    Regex,
    Save,
    Sparkles,
    SquarePlus,
    Wand2,
    X,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import {Button} from "@/components/ui/button";
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
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {askExternalAi} from "@/components/ask-ai-button";
import {useToast} from "@/hooks/use-toast";
import {blockCategories, type CodeBlockTemplate} from "@/lib/code-templates";
import {CODE_THEMES} from "@/lib/code-themes";
import {formatSymbol, type PythonSymbol} from "@/lib/python-symbols";
import {cn} from "@/lib/utils";
import type {CodeViewerProps, Diagnostic} from "@/components/code-viewer-types";

export interface CodeViewerToolbarProps {
    /** The file's lines (the Ln count). */
    lines: string[];
    /** The diagnostics tally. */
    diagCounts: { total: number; errors: number; warnings: number };
    /** The diagnostics currently surfaced. */
    shownDiagnostics: Diagnostic[] | undefined;
    /** Jump-to-line (stable ref). */
    handleSymbolClickRef: React.RefObject<(line: number) => void>;
    /** True while spell checking is on. */
    spellEnabled: boolean;
    /** True while a spell scan runs. */
    spellChecking: boolean;
    /** Misspelled words found. */
    spellIssues: Array<{ word: string; line: number; col: number }>;
    /** Open containing folder handler. */
    onOpenFolder: CodeViewerProps["onOpenFolder"];
    /** Whether folder opening is allowed. */
    canOpenFolder: CodeViewerProps["canOpenFolder"];
    /** True while a folder opens. */
    isOpeningFolder: CodeViewerProps["isOpeningFolder"];
    /** Downloads the file. */
    handleDownload: () => void;
    /** Copies the whole file. */
    handleCopy: () => void;
    /** True right after a copy. */
    copied: boolean;
    /** Integrated-AI prompt sender. */
    onAiPrompt: CodeViewerProps["onAiPrompt"];
    /** AI test generation trigger. */
    onGenerateTests: CodeViewerProps["onGenerateTests"];
    /** True while tests generate. */
    generatingTests: CodeViewerProps["generatingTests"];
    /** External AI endpoints. */
    aiEndpoints: CodeViewerProps["aiEndpoints"];
    /** The toast fn for external-AI errors. */
    aiToast: ReturnType<typeof useToast>["toast"];
    /** The file's source (AI prompt excerpts). */
    code: string;
    /** AI completion chip gate. */
    aiCompletionEnabled: CodeViewerProps["aiCompletionEnabled"];
    /** True in edit mode. */
    editMode: boolean;
    /** The theme toggle button. */
    themeToggleRef: React.RefObject<HTMLButtonElement | null>;
    /** True while the theme bar is open. */
    showThemePicker: boolean;
    /** Toggles the theme bar. */
    setShowThemePicker: React.Dispatch<React.SetStateAction<boolean>>;
    /** The active code theme entry. */
    themeEntry: (typeof CODE_THEMES)[number];
    /** Symbols popover gate. */
    showSymbolOutline: CodeViewerProps["showSymbolOutline"];
    /** The file's parsed symbols. */
    symbols: PythonSymbol[];
    /** True while the symbols popover is open. */
    showSymbolDropdown: boolean;
    /** Toggles the symbols popover. */
    setShowSymbolDropdown: React.Dispatch<React.SetStateAction<boolean>>;
    /** Jumps to a symbol's line. */
    handleSymbolClick: (line: number) => void;
    /** Opens the find bar. */
    openFindBar: () => void;
    /** Save handler presence gates View/Edit. */
    onSaveEdit: CodeViewerProps["onSaveEdit"];
    /** True while a save is in flight. */
    saving: boolean;
    /** Discards edits. */
    handleCancelEdit: () => void;
    /** Enters edit mode. */
    handleStartEdit: () => void;
    /** The persisted zoom level. */
    codeZoom: number;
    /** Updates the zoom level. */
    setCodeZoom: React.Dispatch<React.SetStateAction<number>>;
    /** True when the backdrop is permanently plain. */
    editPlainPermanent: boolean;
    /** The live edit buffer. */
    editContent: string;
    /** The plain-mode character budget. */
    EDIT_PLAIN_MAX_CHARS: number;
    /** Insert ▸ block templates. */
    insertBlocks: CodeBlockTemplate[];
    /** Inserts a block at the caret. */
    insertBlockAtCaret: (template: string) => void;
    /** Autosave delay (0 = off). */
    autoSaveDelayMs: number;
    /** The autosave status chip. */
    autoSaveStatus: "idle" | "saving" | "saved";
    /** Saves the buffer. */
    handleSaveEdit: (opts?: { keepEditMode?: boolean }) => void;
}

export function CodeViewerToolbar(props: CodeViewerToolbarProps) {
    const {
        lines,
        diagCounts,
        shownDiagnostics,
        handleSymbolClickRef,
        spellEnabled,
        spellChecking,
        spellIssues,
        onOpenFolder,
        canOpenFolder,
        isOpeningFolder,
        handleDownload,
        handleCopy,
        copied,
        onAiPrompt,
        onGenerateTests,
        generatingTests,
        aiEndpoints,
        aiToast,
        code,
        aiCompletionEnabled,
        editMode,
        themeToggleRef,
        showThemePicker,
        setShowThemePicker,
        themeEntry,
        showSymbolOutline,
        symbols,
        showSymbolDropdown,
        setShowSymbolDropdown,
        handleSymbolClick,
        openFindBar,
        onSaveEdit,
        saving,
        handleCancelEdit,
        handleStartEdit,
        codeZoom,
        setCodeZoom,
        editPlainPermanent,
        editContent,
        EDIT_PLAIN_MAX_CHARS,
        insertBlocks,
        insertBlockAtCaret,
        autoSaveDelayMs,
        autoSaveStatus,
        handleSaveEdit,
    } = props;
    return (
        <>
            {/* ─── file stats chip — total lines + the live
             zigzag count. Clicking it jumps to the first issue. */}

            {(lines.length > 0 || diagCounts.total > 0) && (
                <span
                    className="flex items-center gap-1.5 h-7 px-2 rounded-md border bg-background/60 text-[10px] text-muted-foreground shrink-0 tabular-nums"
                    title={`${lines.length.toLocaleString()} lines${diagCounts.total > 0 ? ` · ${diagCounts.errors} error${diagCounts.errors === 1 ? "" : "s"}, ${diagCounts.warnings} warning${diagCounts.warnings === 1 ? "" : "s"} — click to jump to the first issue` : ""}`}
                >
             <span>{lines.length.toLocaleString()} Ln</span>
                    {diagCounts.total > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                const first = (shownDiagnostics ?? [])[0];
                                if (first) handleSymbolClickRef.current(first.line);
                            }}
                            className="flex items-center gap-1 rounded px-1 hover:bg-foreground/10 transition-colors"
                            title={`${diagCounts.errors} error${diagCounts.errors === 1 ? "" : "s"} · ${diagCounts.warnings} warning${diagCounts.warnings === 1 ? "" : "s"} — click to jump to the first issue`}
                        >
                            {diagCounts.errors > 0 && (
                                <span className="flex items-center gap-0.5 text-red-500">
                     <span className="size-1.5 rounded-full bg-red-500"/>
                                    {diagCounts.errors}
                   </span>
                            )}
                            {diagCounts.warnings > 0 && (
                                <span className="flex items-center gap-0.5 text-amber-500">
                     <span className="size-1.5 rounded-full bg-amber-500"/>
                                    {diagCounts.warnings}
                   </span>
                            )}
                        </button>
                    )}
                    {/* Spell status — the comment/string
                 misspellings count; the tooltip lists the first
                 positions. The marks themselves live in the code
                 body (view chips / edit underlines). */}
                    {spellEnabled && (spellChecking || spellIssues.length > 0) && (
                        <span
                            className="flex items-center gap-0.5 rounded px-1 tabular-nums"
                            title={
                                spellChecking
                                    ? "Spell check running…"
                                    : `Spell check: ${spellIssues.length} misspelled word${spellIssues.length === 1 ? "" : "s"} in comments/strings.
${spellIssues
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
            )}
            {/* ─── grouped toolbar ─────────────────────────
the report: "the options in the editor are too many
cascaded next to each other (Open folder, Download, Copy,
Explain, Improve, Tests, One Light, Symbols, Find, View,
Edit) — find another design, like grouping some in a drop
down". The rarely-used file actions collapse into ONE
"File" dropdown, the three AI actions into ONE "AI"
dropdown; Theme / Symbols / Find / the View|Edit segmented
control stay direct (they toggle state rather than act
once, so they benefit from being one click away).
Everything that was reachable before still is — including
the external-AI routing, which lives in two submenus. */}
            {/* File actions always exist (download + copy have local
             handlers; "Open folder" only when the parent wired it). */}
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
                        <DropdownMenuItem onClick={onOpenFolder} disabled={!canOpenFolder || isOpeningFolder}
                                          className="gap-2 cursor-pointer"
                                          title="Open the containing folder in your OS file explorer">
                            {isOpeningFolder ? <Loader2 className="size-3.5 animate-spin"/> :
                                <FolderOpen className="size-3.5 text-cyan-500"/>}
                            <span className="flex-1">{isOpeningFolder ? "Opening…" : "Open Folder"}</span>
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handleDownload} className="gap-2 cursor-pointer"
                                      title="Download this file to your computer">
                        <Download className="size-3.5 text-purple-500"/>
                        <span className="flex-1">Download</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopy} className="gap-2 cursor-pointer"
                                      title="Copy the entire file contents to the clipboard">
                        {copied ? <Check className="size-3.5 text-emerald-500"/> : <Copy className="size-3.5"/>}
                        <span className="flex-1">{copied ? "Copied!" : "Copy All"}</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            {/* AI dropdown — Explain / Improve / Tests + the external-AI
             submenus (restores every routing the old side-by-side
             AskAiButtons offered, in one compact trigger). */}
            {(onAiPrompt || onGenerateTests || (aiEndpoints && aiEndpoints.some((e) => e.enabled))) && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
                                title="AI actions — explain, improve, generate tests, or ask an external AI">
                            <Sparkles className="size-3.5 text-emerald-500"/>
                            <span className="hidden sm:inline">AI</span>
                            <ChevronDown className="size-3"/>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                        {onAiPrompt && (
                            <>
                                <DropdownMenuItem
                                    onClick={() =>
                                        onAiPrompt(
                                            `Explain what this Python script does, step by step:\n\n\`\`\`python\n${code.slice(0, 6000)}\n\`\`\``
                                        )
                                    }
                                    className="gap-2 cursor-pointer"
                                    title="Ask the integrated AI assistant to explain what this script does, step by step"
                                >
                                    <Sparkles className="size-3.5 text-emerald-500"/>
                                    <span className="flex-1">Explain</span>
                                    <span className="text-[10px] text-muted-foreground">Sidebar</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() =>
                                        onAiPrompt(
                                            `Improve this Python script for readability, performance, and correctness. Show the improved version and explain each change:\n\n\`\`\`python\n${code.slice(0, 6000)}\n\`\`\``
                                        )
                                    }
                                    className="gap-2 cursor-pointer"
                                    title="Ask the integrated AI assistant to suggest readability, performance, and correctness improvements"
                                >
                                    <Wand2 className="size-3.5 text-amber-500"/>
                                    <span className="flex-1">Improve</span>
                                    <span className="text-[10px] text-muted-foreground">Sidebar</span>
                                </DropdownMenuItem>
                            </>
                        )}
                        {/* AI test generation uses the server-side SDK and has
                   nothing to do with the external "Ask AI" endpoints,
                   so it must NOT be gated on endpoints being enabled
                   (H5). */}
                        {onGenerateTests && (
                            <>
                                {onAiPrompt && <DropdownMenuSeparator/>}
                                <DropdownMenuItem
                                    onClick={onGenerateTests}
                                    disabled={generatingTests}
                                    className="gap-2 cursor-pointer"
                                    title={generatingTests ? "Generating tests… (disabled until completion)" : "Generate AI tests for this script"}
                                >
                                    {generatingTests ? <Loader2 className="size-3.5 text-cyan-500 animate-spin"/> :
                                        <FlaskConical className="size-3.5 text-cyan-500"/>}
                                    <span className="flex-1">{generatingTests ? "Generating…" : "Generate Tests"}</span>
                                </DropdownMenuItem>
                            </>
                        )}
                        {aiEndpoints && aiEndpoints.some((e) => e.enabled) && (
                            <>
                                <DropdownMenuSeparator/>
                                <DropdownMenuLabel
                                    className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    External AI endpoints
                                </DropdownMenuLabel>
                                {(["Explain", "Improve"] as const).map((kind) => (
                                    <DropdownMenuSub key={kind}>
                                        <DropdownMenuSubTrigger className="gap-2 cursor-pointer"
                                                                title={`Copy the ${kind.toLowerCase()} question and open the chosen AI's website`}>
                                            {kind === "Explain" ? <Sparkles className="size-3.5 text-purple-500"/> :
                                                <Wand2 className="size-3.5 text-purple-500"/>}
                                            <span className="flex-1">{kind} Via…</span>
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent className="w-56">
                                            {aiEndpoints.filter((e) => e.enabled).map((ep) => (
                                                <DropdownMenuItem
                                                    key={ep.name}
                                                    onClick={() =>
                                                        void askExternalAi(
                                                            kind === "Explain"
                                                                ? `Explain what this Python script does, step by step:\n\n\`\`\`python\n${code.slice(0, 4000)}\n\`\`\``
                                                                : `Improve this Python script for readability, performance, and correctness:\n\n\`\`\`python\n${code.slice(0, 4000)}\n\`\`\``,
                                                            ep,
                                                            aiToast
                                                        )
                                                    }
                                                    className="gap-2 cursor-pointer"
                                                    title={`Copy the question and open ${ep.name} in a new tab`}
                                                >
                                                    <ExternalLink className="size-3.5"/>
                                                    <span className="flex-1 truncate">{ep.name}</span>
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                ))}
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {aiCompletionEnabled && editMode && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0"
                      title="AI completion is active"><Sparkles className="size-3"/>AI</span>
            )}
            <span aria-hidden="true" className="w-px h-5 bg-border shrink-0"/>
            <Button ref={themeToggleRef} variant="ghost" size="sm" onClick={() => setShowThemePicker((v) => !v)}
                    className="h-8 gap-1.5 text-xs" aria-label="Code theme" aria-expanded={showThemePicker}
                    title={`Code theme: ${themeEntry.label} — click to show/hide the theme bar (click outside or Esc closes it)`}>
                <Palette className={cn("size-3.5", showThemePicker && "text-emerald-500")}/>
                <span className="hidden sm:inline truncate max-w-[80px]">{themeEntry.label}</span>
                <ChevronDown className={cn("size-3 transition-transform", showThemePicker && "rotate-180")}/>
            </Button>
            {showSymbolOutline && symbols.length > 0 && (
                <Popover open={showSymbolDropdown} onOpenChange={setShowSymbolDropdown}>
                    <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
                                                    title="Jump to a function or class definition in this file"><FunctionSquare
                        className="size-3.5"/><span className="hidden sm:inline">Symbols</span><ChevronDown
                        className="size-3"/></Button></PopoverTrigger>
                    <PopoverContent align="end" className="p-0 w-72">
                        <div
                            className="px-3 py-2 border-b text-[10px] uppercase tracking-wide text-muted-foreground">Symbols
                            · {symbols.length}</div>
                        <div className="max-h-60 overflow-y-auto py-1">
                            {symbols.map((sym) => (
                                <button key={`${sym.type}-${sym.line}-${sym.name}`}
                                        onClick={() => handleSymbolClick(sym.line)}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent"
                                        title={formatSymbol(sym)}>
                                    {sym.type === "class" ? <Box className="size-3.5 shrink-0 text-amber-500"/> :
                                        <FunctionSquare className="size-3.5 shrink-0 text-sky-500"/>}
                                    <span
                                        className="font-mono truncate flex-1">{sym.name}{sym.type !== "class" && sym.args ?
                                        <span className="text-muted-foreground">({sym.args})</span> : null}</span>
                                    <span
                                        className="text-[10px] text-muted-foreground tabular-nums shrink-0">L{sym.line}</span>
                                </button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
            )}
            <Button variant="ghost" size="sm" onClick={() => openFindBar()} className="h-8 gap-1.5 text-xs"
                    title="Find (Ctrl+F) — prefills with the current selection"><Regex className="size-3.5"/><span
                className="hidden sm:inline">Find</span></Button>
            {/* ─── View / Edit segmented control (F5 UX pass) ─────
Replaces the lone pencil "Edit" button: both modes are
visible and the ACTIVE one is highlighted, so the current
mode is explicit — the VSCode-style treatment of the
view/edit options.
Clicking View while editing = the Cancel action
(discard edits → read-only view). */}
            <span aria-hidden="true" className="w-px h-5 bg-border shrink-0"/>
            {onSaveEdit ? (
                <div
                    role="group"
                    aria-label="Editor mode"
                    className="flex items-center rounded-md border overflow-hidden h-8 shrink-0"
                >
                    <button
                        type="button"
                        onClick={() => {
                            if (editMode) handleCancelEdit();
                        }}
                        disabled={!editMode || saving}
                        aria-pressed={!editMode}
                        title={editMode ? "Discard edits and return to the read-only view" : "Read-only view (syntax highlighted)"}
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
                        onClick={handleStartEdit}
                        disabled={editMode || saving}
                        aria-pressed={editMode}
                        title="Switch to edit mode (inline textarea editor with the same theme)"
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
            {/* ZOOM — the union-bar cluster (parity with the other languages'
             viewers): − / level / +, persisted at praxis.codeZoom.
             Sits right after the View|Edit control so both bars end
             the same way: [… File AI theme Symbols Find View|Edit zoom]. */}
            <div className="flex items-center rounded-md border overflow-hidden h-8 shrink-0" role="group"
                 aria-label="Editor zoom">
                <button
                    type="button"
                    onClick={() => setCodeZoom((z) => Math.max(0.6, Math.round((z / 1.15) * 100) / 100))}
                    className="flex items-center justify-center w-8 h-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="Zoom out (min 60%) — scales the edit textarea and the view renderer alike"
                    aria-label="Zoom out"
                >
                    <ZoomOut className="size-3.5"/>
                </button>
                <span className="text-[10px] font-mono w-10 text-center text-muted-foreground tabular-nums select-none"
                      title="Zoom level for this editor (persisted — praxis.codeZoom)">
             {Math.round(codeZoom * 100)}%
           </span>
                <button
                    type="button"
                    onClick={() => setCodeZoom((z) => Math.min(2.5, Math.round((z * 1.15) * 100) / 100))}
                    className="flex items-center justify-center w-8 h-full border-l text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="Zoom in (max 250%) — scales the edit textarea and the view renderer alike"
                    aria-label="Zoom in"
                >
                    <ZoomIn className="size-3.5"/>
                </button>
            </div>
            {/* honest signal when the edit-mode backdrop has
             no syntax colors — either the file is too large to re-tokenize
             per pause, or highlighting is disabled in Settings → Advanced. */}
            {editMode && editPlainPermanent && (
                <span
                    className="hidden sm:inline text-[10px] text-muted-foreground/80 shrink-0 whitespace-nowrap"
                    title={
                        editContent.length > EDIT_PLAIN_MAX_CHARS
                            ? `This file is too large for live syntax coloring in edit mode (> ${Math.round(EDIT_PLAIN_MAX_CHARS / 1000)}k chars) — the editor stays fast by rendering plain text while typing. Colors return in view mode.`
                            : "Syntax highlighting is off (Settings → Advanced → Syntax highlighting)."
                    }
                >
             {editContent.length > EDIT_PLAIN_MAX_CHARS ? "plain text (large file)" : "plain text (highlighting off)"}
           </span>
            )}
            {editMode && (
                <>
                    {/* Insert block — file-type-aware code blocks inserted at the
                 caret (python / markdown / gitignore / txt / …), styled
                 per Settings → Editor → Naming style. Same items live in
                 the editor's right-click menu. */}
                    {insertBlocks.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1.5 text-xs"
                                    title="Insert a code block at the cursor — function, class, loop, figure, table… (also on right-click)"
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
                    {autoSaveDelayMs > 0 && autoSaveStatus !== "idle" && <span
                      className={cn("text-[10px] px-1.5 tabular-nums shrink-0", autoSaveStatus === "saving" ? "text-amber-500" : "text-emerald-500")}>{autoSaveStatus === "saving" ? "Saving\u2026" : "Saved"}</span>}
                    <Button variant="ghost" size="sm" onClick={() => handleSaveEdit()} disabled={saving}
                            className="h-8 gap-1.5 text-xs text-emerald-600"
                            title="Save the edited file to disk">{saving ?
                        <Loader2 className="size-3.5 animate-spin"/> : <Save className="size-3.5"/>}<span
                        className="hidden sm:inline">{saving ? "Saving\u2026" : "Save"}</span></Button>
                    <Button variant="ghost" size="sm" onClick={handleCancelEdit} disabled={saving}
                            className="h-8 gap-1.5 text-xs" title="Discard edits and return to read-only view"><X
                        className="size-3.5"/><span className="hidden sm:inline">Cancel</span></Button>
                </>
            )}
        </>
    );
}
