"use client";

import * as React from "react";
import {useTheme} from "next-themes";
import {Columns2, Eye, FilePen, ListTree} from "lucide-react";
import {cn} from "@/lib/utils";
import {parseMarkdownOutline} from "@/lib/markdown-outline";
import {SpellTextOverlay} from "@/components/spell-text-overlay";
import {SyntaxHighlighter} from "@/lib/highlighter";
import {oneDark, oneLight} from "react-syntax-highlighter/dist/esm/styles/prism";
import {getIndentSettings} from "@/lib/indent";
import {loadSettings} from "@/lib/settings";

/**
 * The Markdown studio — split editor | live-rendered preview with
 * proportional synced scrolling + a clickable outline sidebar. The
 * preview render function is INJECTED by the FileViewer (it owns the
 * markdown renderer with KaTeX + spell-check wiring), so the studio
 * adds the layout without duplicating renderer code.
 *
 * The EDITOR pane is a real code editor now, not a bare textarea:
 *   ▸ a Prism markdown backdrop supplies the syntax colors behind a
 *     transparent-text textarea (the same layered technique the
 *     file/code editors use — while typing the backdrop is a plain
 *     <pre> with identical metrics, colors return ~160 ms after the
 *     typing pause);
 *   ▸ a synced line-number gutter;
 *   ▸ Tab / Shift+Tab indent-dedent, Enter auto-indent with list
 *     continuation, Ctrl/Cmd+Z undo + Ctrl/Cmd+Y redo via the
 *     FileViewer's programmatic-rewrite stacks, and ⌘⇧F auto-format
 *     (routed to the FileViewer's formatter);
 *   ▸ the studio toolbar keeps the Split / Editor / Preview segmented
 *     control (the header's Preview / Studio / Source switch owns the
 *     FILE-level modes — the inner control only lays out the studio).
 */

interface MarkdownStudioProps {
    content: string;
    onChange: (text: string) => void;
    /** Render `text` as markdown — provided by the FileViewer. */
    renderPreview: (text: string) => React.ReactNode;
    /** Studio font scale (per-kind zoom). */
    fontScale?: number;
    /** Hide the outline sidebar (narrow panes). */
    compact?: boolean;
    /** Wavy spell underlines over the source editor (the preview
     *  already marks via renderPreview). */
    spellWords?: Set<string>;
    onIgnoreSpell?: (word: string) => void;
    /** Replace-in-place for the source editor's spell popover — swaps
     *  every occurrence of the misspelled word for the picked suggestion
     *  through the studio's own onChange (a normal, undoable edit). */
    onReplaceSpell?: (word: string, suggestion: string) => void;
    /** Pop the FileViewer's programmatic-rewrite UNDO stack (a format
     *  pass rewrote the buffer). Returns false when the stack is empty
     *  so the native textarea undo can take over. */
    onUndo?: () => boolean;
    /** Pop the FileViewer's programmatic-rewrite REDO stack. */
    onRedo?: () => boolean;
    /** Auto-format the buffer (FileViewer's runFormatter("format")). */
    onFormat?: () => void;
}

type StudioMode = "split" | "editor" | "preview";

const STUDIO_MODE_STORAGE_KEY = "praxis.mdStudio.mode";

/** Legacy value mapping: the inner mode used to be called "source". */
function normalizeStudioMode(saved: string | null): StudioMode | null {
    if (saved === "split" || saved === "preview") return saved;
    if (saved === "source" || saved === "editor") return "editor";
    return null;
}

export function MarkdownStudio({
                                   content,
                                   onChange,
                                   renderPreview,
                                   fontScale = 1,
                                   compact,
                                   spellWords,
                                   onIgnoreSpell,
                                   onReplaceSpell,
                                   onUndo,
                                   onRedo,
                                   onFormat
                               }: MarkdownStudioProps) {
    const {resolvedTheme} = useTheme();
    const isDark = resolvedTheme === "dark";
    const editorRef = React.useRef<HTMLTextAreaElement | null>(null);
    const previewRef = React.useRef<HTMLDivElement | null>(null);
    const outlineRef = React.useRef<HTMLUListElement | null>(null);
    const gutterRef = React.useRef<HTMLDivElement | null>(null);
    const backdropRef = React.useRef<HTMLDivElement | null>(null);
    // The spell overlay mirrors the editor's pixels — it must scroll with
    // it too, or the zigzags drift out of place (see syncEditorScroll).
    const spellOverlayRef = React.useRef<HTMLDivElement | null>(null);
    const syncingRef = React.useRef<"editor" | "preview" | null>(null);

    // The layout mode — Split (classic 50/50), Editor-only or
    // Preview-only (reading). Sticks across files for the session.
    const [mode, setMode] = React.useState<StudioMode>(() => {
        try {
            const saved = normalizeStudioMode(window.sessionStorage.getItem(STUDIO_MODE_STORAGE_KEY));
            if (saved) return saved;
        } catch { /* ignore */
        }
        return "split";
    });
    React.useEffect(() => {
        try {
            window.sessionStorage.setItem(STUDIO_MODE_STORAGE_KEY, mode);
        } catch { /* ignore */
        }
    }, [mode]);

    // While the user is typing the Prism backdrop is swapped for a plain
    // <pre> with identical metrics (re-tokenizing per keystroke is the
    // perf trap the other editors avoid); the colors return shortly
    // after the typing pause.
    const [highlightHot, setHighlightHot] = React.useState(true);
    React.useEffect(() => {
        setHighlightHot(false);
        const t = setTimeout(() => setHighlightHot(true), 160);
        return () => clearTimeout(t);
    }, [content]);
    const backdropPlain = !highlightHot || content.length > 40_000;

    const lineCount = React.useMemo(() => (content ? content.split("\n").length : 1), [content]);

    const outline = React.useMemo(() => parseMarkdownOutline(content), [content]);
    const [activeHeading, setActiveHeading] = React.useState<number>(-1);

    // Document stats for the studio toolbar.
    const stats = React.useMemo(() => {
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        const chars = content.length;
        const lines = content ? content.split("\n").length : 0;
        const readingTime = Math.max(1, Math.ceil(words / 220));
        return {words, chars, lines, readingTime, headings: outline.length};
    }, [content, outline.length]);

    // Keep the line-number gutter + backdrop scrolled with the textarea.
    const syncEditorScroll = () => {
        const editor = editorRef.current;
        if (!editor) return;
        if (gutterRef.current) gutterRef.current.scrollTop = editor.scrollTop;
        if (backdropRef.current) {
            backdropRef.current.scrollTop = editor.scrollTop;
            backdropRef.current.scrollLeft = editor.scrollLeft;
        }
        // The SPELL overlay is part of the same mirror stack — without
        // this the wavy underlines render at the wrong lines whenever the
        // editor is scrolled (or a format/indent pass re-laid-out the
        // buffer under a non-zero scroll offset).
        if (spellOverlayRef.current) {
            spellOverlayRef.current.scrollTop = editor.scrollTop;
            spellOverlayRef.current.scrollLeft = editor.scrollLeft;
        }
    };

    // Re-align every mirrored layer AFTER the buffer changes — edits,
    // Auto-format and Auto-indent rewrite the text (and often move the
    // caret / scroll position); the next frame re-syncs the overlay so
    // the zigzags sit on their words immediately, not after the first
    // manual scroll.
    React.useEffect(() => {
        const raf = requestAnimationFrame(() => syncEditorScroll());
        return () => cancelAnimationFrame(raf);
    }, [content, mode]);

    // Proportional scroll sync — whichever side the user scrolls drives
    // the other (guarded so the echo doesn't loop).
    const onEditorScroll = () => {
        syncEditorScroll();
        if (syncingRef.current === "preview") {
            syncingRef.current = null;
            return;
        }
        syncingRef.current = "editor";
        const editor = editorRef.current;
        const preview = previewRef.current;
        if (editor && preview) {
            const ratio = editor.scrollTop / Math.max(1, editor.scrollHeight - editor.clientHeight);
            preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
        }
        updateActiveHeading();
    };
    const onPreviewScroll = () => {
        if (syncingRef.current === "editor") {
            syncingRef.current = null;
            return;
        }
        syncingRef.current = "preview";
        const editor = editorRef.current;
        const preview = previewRef.current;
        if (editor && preview) {
            const ratio = preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight);
            editor.scrollTop = ratio * (editor.scrollHeight - editor.clientHeight);
            syncEditorScroll();
        }
        updateActiveHeading();
    };

    const updateActiveHeading = () => {
        const editor = editorRef.current;
        if (!editor) return;
        const lineHeight = parseFloat(getComputedStyle(editor).lineHeight || "20") || 20;
        const line = Math.round(editor.scrollTop / lineHeight) + 1;
        let active = -1;
        outline.forEach((h, i) => {
            if (h.line + 1 <= line) active = i;
        });
        setActiveHeading(active);
    };

    const jumpToHeading = (line: number) => {
        const editor = editorRef.current;
        if (!editor) return;
        if (mode === "preview") setMode("split");
        const lineHeight = parseFloat(getComputedStyle(editor).lineHeight || "20") || 20;
        editor.scrollTo({top: line * lineHeight, behavior: "smooth"});
        editor.focus({preventScroll: true});
        // Place the caret on the heading line.
        const pos = content.split("\n").slice(0, line).join("\n").length + (line > 0 ? 1 : 0);
        editor.setSelectionRange(pos, pos);
    };

    /** Editor-grade key handling: undo/redo pops, Tab indent, Enter
     *  auto-indent + list continuation, ⌘⇧F format. */
    const onEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const ta = e.currentTarget;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && !e.altKey && (e.key === "z" || e.key === "Z")) {
            // Programmatic rewrites (a format pass) killed the native undo
            // stack — the FileViewer's snapshot stack serves Ctrl+Z first;
            // once empty the event falls through to the native typing undo.
            if (e.shiftKey) {
                if (onRedo && onRedo()) {
                    e.preventDefault();
                    return;
                }
                return;
            }
            if (onUndo && onUndo()) {
                e.preventDefault();
                return;
            }
            return;
        }
        if (mod && !e.altKey && (e.key === "y" || e.key === "Y")) {
            if (onRedo && onRedo()) e.preventDefault();
            return;
        }
        if (mod && e.shiftKey && (e.key === "f" || e.key === "F")) {
            if (onFormat) {
                e.preventDefault();
                onFormat();
            }
            return;
        }
        const s = getIndentSettings(loadSettings());
        const unit = s.style === "tab" ? "\t" : " ".repeat(Math.max(1, Math.min(8, s.width)));
        if (e.key === "Enter" && !mod && !e.altKey && !e.shiftKey) {
            e.preventDefault();
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const before = content.slice(0, start);
            const lineStart = before.lastIndexOf("\n") + 1;
            const currentLine = content.slice(lineStart, start);
            const indentMatch = currentLine.match(/^[ \t]*/);
            let indent = indentMatch ? indentMatch[0] : "";
            // List continuation: "- item" / "* item" / "1. item" repeats the
            // marker on the next line (an empty item breaks the list).
            const listMatch = currentLine.match(/^([ \t]*)([-*+]|\d+\.)([ \t]+)(.*)$/);
            let insert: string;
            if (listMatch && listMatch[4].trim() !== "") {
                insert = "\n" + listMatch[1] + listMatch[2] + listMatch[3];
            } else if (listMatch) {
                // Empty item — end the list (plain newline, no marker).
                insert = "\n" + listMatch[1].slice(unit.length);
                if (insert === "\n" + listMatch[1]) insert = "\n";
            } else {
                insert = "\n" + indent;
            }
            const newContent = content.slice(0, start) + insert + content.slice(end);
            onChange(newContent);
            requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start + insert.length;
            });
            return;
        }
        if (e.key === "Tab") {
            e.preventDefault();
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const selected = content.slice(start, end);
            const hasNewline =
                selected.includes("\n") ||
                content.slice(0, start).lastIndexOf("\n") !== content.slice(0, end).lastIndexOf("\n");
            if (hasNewline || e.shiftKey) {
                const firstLineStart = content.slice(0, start).lastIndexOf("\n") + 1;
                const block = content.slice(firstLineStart, end);
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
                onChange(content.slice(0, firstLineStart) + newBlock + content.slice(end));
                const lengthDiff = newBlock.length - block.length;
                requestAnimationFrame(() => {
                    ta.selectionStart = firstLineStart;
                    ta.selectionEnd = end + lengthDiff;
                });
                return;
            }
            const newContent = content.slice(0, start) + unit + content.slice(end);
            onChange(newContent);
            requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start + unit.length;
            });
            return;
        }
    };

    const modeButton = (m: StudioMode, icon: React.ReactNode, label: string, title: string) => (
        <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            title={title}
            aria-pressed={mode === m}
            className={cn(
                "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
                mode === m
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
        >
            {icon} <span className="hidden sm:inline">{label}</span>
        </button>
    );

    const showEditor = mode === "split" || mode === "editor";
    const showPreview = mode === "split" || mode === "preview";

    const editorFontStyle = {
        fontSize: `${13 * fontScale}px`,
        lineHeight: 1.6,
        fontFamily: "var(--font-jb-mono), monospace",
    } as React.CSSProperties;

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* ── Studio toolbar ─────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-1.5">
                <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5" role="group"
                     aria-label="Studio layout mode">
                    {modeButton("split", <Columns2
                        className="size-3.5"/>, "Split", "Editor and preview side by side (scroll-synced)")}
                    {modeButton("editor", <FilePen className="size-3.5"/>, "Editor", "Editor only — focus on writing")}
                    {modeButton("preview", <Eye
                        className="size-3.5"/>, "Preview", "Rendered document only — reading mode")}
                </div>
                <span className="hidden md:inline text-[10px] text-muted-foreground" title="Live document statistics">
          {stats.words.toLocaleString()} words · {stats.chars.toLocaleString()} chars · {stats.lines.toLocaleString()} lines · {stats.headings} headings · ~{stats.readingTime} min read
        </span>
                <span className="ml-auto hidden lg:inline text-[10px] text-muted-foreground/70"
                      title="Both panes scroll together proportionally">
          {mode === "split" ? "scroll-synced panes" : mode === "editor" ? "writing mode" : "reading mode"}
        </span>
            </div>

            {/* ── Body: outline rail + panes ────────────────────────────── */}
            <div className="flex min-h-0 flex-1">
                {!compact && outline.length > 0 && (
                    <div className="hidden lg:flex flex-col w-48 shrink-0 border-r bg-muted/10">
                        <p className="flex items-center gap-1.5 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <ListTree className="size-3"/> Outline
                            <span
                                className="ml-auto rounded-full bg-muted px-1.5 text-[9px] tabular-nums">{outline.length}</span>
                        </p>
                        <ul ref={outlineRef} className="flex-1 overflow-y-auto px-1.5 pb-2 space-y-0.5">
                            {outline.map((h, i) => (
                                <li key={`${h.line}-${h.text}`}>
                                    <button
                                        type="button"
                                        className={cn(
                                            "relative w-full text-left text-[11px] rounded px-1.5 py-1 truncate hover:bg-muted/60 transition",
                                            activeHeading === i && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                                            h.level > 1 && "opacity-90"
                                        )}
                                        style={{paddingLeft: `${(h.level - 1) * 10 + 6}px`}}
                                        title={h.text}
                                        onClick={() => jumpToHeading(h.line)}
                                    >
                                        {activeHeading === i && (
                                            <span aria-hidden
                                                  className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-500"/>
                                        )}
                                        {h.text}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div
                    className={cn(
                        "grid min-w-0 flex-1",
                        mode === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
                        mode === "split" && "divide-x"
                    )}
                >
                    {/* ── Editor pane ─────────────────────────────────────── */}
                    {showEditor && (
                        <div className="relative flex min-h-0 flex-col">
                            <p className="border-b bg-muted/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Editor
                            </p>
                            <div className="relative flex min-h-0 flex-1">
                                {/* Line-number gutter — scrolled in lockstep with the
                    textarea (which never scrolls internally: the outer
                    container does). */}
                                <div
                                    ref={gutterRef}
                                    aria-hidden="true"
                                    className="hidden sm:block shrink-0 select-none overflow-hidden border-r bg-muted/20 text-right"
                                    style={{
                                        ...editorFontStyle,
                                        padding: "0.75rem 0.5rem 0.75rem 0.5rem",
                                        color: isDark ? "#4b5563" : "#9ca3af"
                                    }}
                                >
                                    {Array.from({length: lineCount}, (_, i) => (
                                        <div key={i} style={{lineHeight: 1.6}}>{i + 1}</div>
                                    ))}
                                </div>
                                <div className="relative min-h-0 flex-1">
                                    {/* The syntax-highlighted backdrop — the textarea's
                      text is transparent, the Prism colors shine
                      through with pixel-identical metrics. While
                      typing (or past 40 K chars) the backdrop is a
                      plain <pre>. */}
                                    <div
                                        ref={backdropRef}
                                        aria-hidden="true"
                                        className="pointer-events-none absolute inset-0 overflow-hidden"
                                    >
                                        {backdropPlain ? (
                                            <pre
                                                style={{
                                                    margin: 0,
                                                    background: "transparent",
                                                    color: isDark ? "#abb2bf" : "#383a42",
                                                    padding: "0.75rem",
                                                    minHeight: "100%",
                                                    whiteSpace: "pre-wrap",
                                                    overflowWrap: "anywhere",
                                                    ...editorFontStyle,
                                                }}
                                            >{content}</pre>
                                        ) : (
                                            <SyntaxHighlighter
                                                language="markdown"
                                                style={isDark ? oneDark : oneLight}
                                                showLineNumbers={false}
                                                wrapLongLines
                                                customStyle={{
                                                    margin: 0,
                                                    background: "transparent",
                                                    padding: "0.75rem",
                                                    minHeight: "100%",
                                                    ...editorFontStyle,
                                                }}
                                                codeTagProps={{style: {fontFamily: "var(--font-jb-mono), monospace"}}}
                                            >{content}</SyntaxHighlighter>
                                        )}
                                    </div>
                                    <textarea
                                        ref={editorRef}
                                        value={content}
                                        onChange={(e) => onChange(e.target.value)}
                                        onKeyDown={onEditorKeyDown}
                                        onScroll={onEditorScroll}
                                        spellCheck={false}
                                        className="relative h-full w-full resize-none bg-transparent p-3 font-mono text-transparent focus:outline-none"
                                        style={{...editorFontStyle, caretColor: isDark ? "#abb2bf" : "#383a42"}}
                                        aria-label="Markdown source"
                                        placeholder="# Heading&#10;&#10;Write markdown — the preview stays live."
                                        data-testid="markdown-studio-editor"
                                    />
                                    {/* The overlay MUST mirror the textarea's exact
                      wrapping metrics — the textarea soft-wraps (the
                      default), so without whiteSpace: pre-wrap +
                      overflowWrap: anywhere the overlay collapses runs
                      of spaces and wraps at different widths, putting
                      the zigzags on the WRONG words/lines and breaking
                      scroll sync after edits / auto-indent /
                      auto-format rewrites. */}
                                    {spellWords && spellWords.size > 0 && onIgnoreSpell && (
                                        <SpellTextOverlay
                                            text={content}
                                            words={spellWords}
                                            onIgnore={onIgnoreSpell}
                                            onReplace={onReplaceSpell}
                                            overlayRef={spellOverlayRef}
                                            className="p-3 font-mono text-transparent"
                                            style={{
                                                ...editorFontStyle,
                                                whiteSpace: "pre-wrap",
                                                overflowWrap: "anywhere",
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {/* ── Preview pane ─────────────────────────────────────── */}
                    {showPreview && (
                        <div className="flex min-h-0 flex-col">
                            <p className="border-b bg-muted/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Preview
                            </p>
                            <div
                                ref={previewRef}
                                onScroll={onPreviewScroll}
                                className="h-full overflow-y-auto p-4"
                                data-testid="markdown-studio-preview"
                            >
                                {renderPreview(content)}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
