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
import {Badge} from "@/components/ui/badge";
import {Checkbox} from "@/components/ui/checkbox";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Label} from "@/components/ui/label";
import {ArrowLeft, ChevronDown, ChevronRight, CircleAlert, FileSearch, Loader2, Pencil,} from "lucide-react";
import {useToast} from "@/hooks/use-toast";
import {isIdentifier} from "@/lib/refactor";
import {
    applyOccurrences,
    defaultOccurrenceSelected,
    findSymbolOccurrences,
    summarizeOccurrences,
} from "@/lib/symbol-matching";
import {armMultiFileUndoHotkey} from "@/lib/multi-file-undo-hotkey";
import {type MultiFileUndoEntry, pushMultiFileUndoGroup} from "@/lib/multi-file-undo";
import {cn} from "@/lib/utils";

/* ================================================================== */
/*  Types                                                              */

/* ================================================================== */

/** One serialized occurrence from GET /api/rename-preview. */
interface PreviewOccurrence {
    /** 1-based line + column of the occurrence. */
    line: number;
    col: number;
    /** 0-based offsets into the scanned buffer (advisory — the apply
     *  recomputes them against the freshly read file). */
    start: number;
    end: number;
    /** The full text of the occurrence's line. */
    snippet: string;
    /** Where the occurrence sits (comment/string rows default OFF). */
    context: "code" | "comment" | "string" | "text";
    /** True when this row IS the def/class declaration site. */
    defSite: boolean;
}

/** One file (with its occurrences) from the preview scan. */
interface PreviewFile {
    folder: string;
    folderSlug: string;
    file: string;
    fileSlug: string;
    /** Forward-slash RELATIVE path — what /api/file-write wants as
     *  fileName, and what the client-side matcher keys off. */
    path: string;
    isPython: boolean;
    occurrences: PreviewOccurrence[];
}

interface RenamePreviewResponse {
    ok: true;
    name: string;
    files: PreviewFile[];
    totalOccurrences: number;
    truncated: boolean;
}

/** Reported to the optional onApplied callback after a successful apply. */
export interface RenameAppliedInfo {
    filesChanged: number;
    occurrences: number;
    oldName: string;
    newName: string;
}

interface RenamePreviewDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** The symbol being renamed (from the Shift+F6 / context-menu flow). */
    symbol: string;
    /**
     * Optional: called when a preview row is clicked so the parent can
     * open the file at that line (mirrors FindUsagesDialog's onJumpTo).
     */
    onJumpTo?: (folderSlug: string, fileSlug: string, line: number) => void;
    /**
     * Optional: called after the rename's writes land — the parent can
     * refresh + reselect the open editor tab. When omitted the dialog
     * still dispatches the `praxis:refresh-folders` window event, which
     * page.tsx already handles.
     */
    onApplied?: (info: RenameAppliedInfo) => void;
    /**
     * Optional LEGACY one-shot rename (old RenameDialog contract). Used
     * ONLY as a fallback when the preview scan endpoint is unreachable
     * (e.g. an offline /api hiccup) so the dialog degrades to the exact
     * behavior page.tsx wired before, instead of failing outright.
     */
    onRename?: (oldName: string, newName: string) => Promise<void>;
}

/* ================================================================== */
/*  Keys + small helpers                                              */

/* ================================================================== */

/**
 * Stable identity for one preview row: folder+file slugs pin the file,
 * line+col pin the occurrence within it. The SAME key is recomputed
 * after the apply-time re-read, so a drifted file simply matches fewer
 * keys instead of replacing the wrong text.
 */
function occKey(folderSlug: string, fileSlug: string, line: number, col: number): string {
    return `${folderSlug}/${fileSlug}#${line}:${col}`;
}

function fileKey(f: { folderSlug: string; fileSlug: string }): string {
    return `${f.folderSlug}/${f.fileSlug}`;
}

/** Highlight the occurrence inside its own line snippet. */
function OccurrenceSnippet({
                               snippet,
                               col,
                               name,
                           }: {
    snippet: string;
    col: number;
    name: string;
}) {
    const start = Math.max(0, col - 1);
    const end = Math.min(snippet.length, start + name.length);
    return (
        <pre className="text-[11px] font-mono mt-0.5 whitespace-pre-wrap break-all flex-1 min-w-0">
      {start > 0 ? <span>{snippet.slice(0, start)}</span> : null}
            <mark className="bg-yellow-300/80 dark:bg-yellow-500/40 text-foreground rounded px-0">
        {snippet.slice(start, end)}
      </mark>
            {end < snippet.length ? <span>{snippet.slice(end)}</span> : null}
    </pre>
    );
}

/* ================================================================== */
/*  Dialog                                                             */

/* ================================================================== */

/**
 * RenamePreviewDialog — the Shift+F6 rename flow with a preview.
 *
 * Flow: (1) enter the new name (validated as a Python identifier) →
 * (2) GET /api/rename-preview scans the whole project and classifies
 * every whole-word occurrence (comments/strings marked, def sites
 * badged) → (3) the user reviews each row (checkbox per occurrence,
 * default OFF for comment/string rows) → (4) Apply re-reads each
 * touched file, re-runs the same matcher client-side, writes ONLY the
 * checked occurrences through /api/file-write, and records the
 * pre-rename content of every touched file as ONE multi-file undo
 * group — a single Ctrl+Z afterwards restores them all.
 *
 * The form state lives in <RenamePreviewForm>, mounted only while the
 * dialog is open (the same remount-resets-state pattern the Find and
 * FindUsages dialogs use).
 */
export function RenamePreviewDialog({
                                        open,
                                        onOpenChange,
                                        symbol,
                                        onJumpTo,
                                        onApplied,
                                        onRename,
                                    }: RenamePreviewDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
                {open && symbol && (
                    <RenamePreviewForm
                        key={symbol}
                        symbol={symbol}
                        onJumpTo={onJumpTo}
                        onApplied={onApplied}
                        onRename={onRename}
                        onClose={() => onOpenChange(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

type Stage = "input" | "loading" | "preview" | "applying";

function RenamePreviewForm({
                               symbol,
                               onJumpTo,
                               onApplied,
                               onRename,
                               onClose,
                           }: {
    symbol: string;
    onJumpTo?: (folderSlug: string, fileSlug: string, line: number) => void;
    onApplied?: (info: RenameAppliedInfo) => void;
    onRename?: (oldName: string, newName: string) => Promise<void>;
    onClose: () => void;
}) {
    const {toast} = useToast();

    const [newName, setNewName] = React.useState(symbol);
    const [stage, setStage] = React.useState<Stage>("input");
    const [files, setFiles] = React.useState<PreviewFile[]>([]);
    const [truncated, setTruncated] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    /** Checked occurrence keys (default: every code/text row — comment
     *  and string rows start UNCHECKED so prose is never silently
     *  rewritten; they remain visible and individually re-checkable). */
    const [checked, setChecked] = React.useState<Set<string>>(new Set());
    const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

    const trimmed = newName.trim();
    const validName = isIdentifier(trimmed);
    const canScan = stage === "input" && trimmed.length > 0 && validName && trimmed !== symbol;

    /* ── Scan: fetch the project-wide occurrence preview ─────────── */

    const runScan = React.useCallback(async () => {
        if (!canScan) return;
        setStage("loading");
        setError(null);
        try {
            const res = await fetch(`/api/rename-preview?name=${encodeURIComponent(symbol)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as RenamePreviewResponse;
            setFiles(data.files);
            setTruncated(data.truncated);
            const next = new Set<string>();
            for (const f of data.files) {
                for (const o of f.occurrences) {
                    if (defaultOccurrenceSelected({context: o.context})) {
                        next.add(occKey(f.folderSlug, f.fileSlug, o.line, o.col));
                    }
                }
            }
            setChecked(next);
            setCollapsed(new Set());
            setStage("preview");
        } catch (e) {
            // Preview endpoint unreachable — degrade to the legacy one-shot
            // rename when the parent still provides it (the old
            // RenameDialog contract), otherwise surface the error.
            if (onRename) {
                try {
                    await onRename(symbol, trimmed);
                    toast({
                        title: "Renamed (without preview)",
                        description: "The occurrence scan was unavailable, so the classic project-wide rename ran instead.",
                        variant: "warning",
                    });
                    onClose();
                    return;
                } catch (err) {
                    setError((err as Error).message);
                    setStage("input");
                    return;
                }
            }
            setError((e as Error).message);
            setFiles([]);
            setStage("input");
        }
    }, [canScan, symbol, trimmed, onRename, toast, onClose]);

    /* ── Derived preview numbers (all memoized — no per-render scans) */

    const summary = React.useMemo(
        () => summarizeOccurrences(files.flatMap((f) => f.occurrences)),
        [files]
    );

    const selectedCount = React.useMemo(() => {
        let n = 0;
        for (const f of files) {
            for (const o of f.occurrences) {
                if (checked.has(occKey(f.folderSlug, f.fileSlug, o.line, o.col))) n++;
            }
        }
        return n;
    }, [files, checked]);

    const selectedFiles = React.useMemo(() => {
        let n = 0;
        for (const f of files) {
            if (f.occurrences.some((o) => checked.has(occKey(f.folderSlug, f.fileSlug, o.line, o.col)))) n++;
        }
        return n;
    }, [files, checked]);

    const canApply = stage === "preview" && selectedCount > 0;

    /* ── Checkbox handlers ────────────────────────────────────────── */

    const toggleOccurrence = (f: PreviewFile, o: PreviewOccurrence) => {
        if (stage !== "preview") return;
        const key = occKey(f.folderSlug, f.fileSlug, o.line, o.col);
        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleFile = (f: PreviewFile) => {
        if (stage !== "preview") return;
        setChecked((prev) => {
            const next = new Set(prev);
            const keys = f.occurrences.map((o) => occKey(f.folderSlug, f.fileSlug, o.line, o.col));
            const all = keys.every((k) => next.has(k));
            for (const k of keys) {
                if (all) next.delete(k);
                else next.add(k);
            }
            return next;
        });
    };

    const toggleCollapsed = (key: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const selectAll = () => {
        const next = new Set<string>();
        for (const f of files) {
            for (const o of f.occurrences) {
                next.add(occKey(f.folderSlug, f.fileSlug, o.line, o.col));
            }
        }
        setChecked(next);
    };

    const clearAll = () => setChecked(new Set());

    /* ── Apply: write checked occurrences as ONE undo group ──────── */

    const handleApply = React.useCallback(async () => {
        if (!canApply) return;
        setStage("applying");
        setError(null);
        const undoEntries: MultiFileUndoEntry[] = [];
        let filesChanged = 0;
        let occurrencesApplied = 0;
        // destructive flows must count and report skipped work — a read
        // or write failure leaves a half-renamed project unless the toast
        // names exactly which files were missed.
        const skipped: string[] = [];
        try {
            for (const f of files) {
                const wanted = f.occurrences.filter((o) =>
                    checked.has(occKey(f.folderSlug, f.fileSlug, o.line, o.col))
                );
                if (wanted.length === 0) continue;
                const readRes = await fetch(
                    `/api/file?folder=${encodeURIComponent(f.folderSlug)}&file=${encodeURIComponent(f.fileSlug)}`
                );
                if (!readRes.ok) {
                    skipped.push(f.path);
                    continue;
                }
                const content = await readRes.text();
                // Re-run the matcher against the LIVE file — the preview's
                // offsets are advisory, and only occurrences still sitting at
                // their previewed (line, col) are applied. This is what makes
                // a mid-dialog external edit SAFE: drifted rows simply stop
                // matching instead of replacing the wrong text.
                const current = findSymbolOccurrences(content, symbol, f.path);
                const toApply = current.filter((o) =>
                    checked.has(occKey(f.folderSlug, f.fileSlug, o.line, o.col))
                );
                if (toApply.length === 0) {
                    skipped.push(`${f.path} (occurrences moved — file changed since the scan)`);
                    continue;
                }
                const newContent = applyOccurrences(content, toApply, trimmed);
                if (newContent === content) {
                    skipped.push(`${f.path} (no effective change)`);
                    continue;
                }
                const writeRes = await fetch("/api/file-write", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({folder: f.folderSlug, fileName: f.path, content: newContent}),
                });
                if (!writeRes.ok) {
                    skipped.push(f.path);
                    continue;
                }
                filesChanged++;
                occurrencesApplied += toApply.length;
                // pre-rename content captured BEFORE the write — the whole
                // set becomes ONE undo group below.
                undoEntries.push({
                    folderSlug: f.folderSlug,
                    fileSlug: f.fileSlug,
                    fileName: f.path,
                    preContent: content,
                });
            }

            if (undoEntries.length > 0) {
                pushMultiFileUndoGroup({
                    label: `Rename "${symbol}" → "${trimmed}"`,
                    entries: undoEntries,
                });
                // Arm the capture-phase Ctrl+Z that restores every entry in
                // one keystroke (armed ONLY while a group is pending, so no
                // per-keystroke cost in normal editing).
                armMultiFileUndoHotkey();
            }

            window.dispatchEvent(new CustomEvent("praxis:refresh-folders"));
            // Extra, grep-able hook for the page: everything the apply did,
            // in one event (the optional onApplied callback covers the same
            // ground for callers that prefer props).
            window.dispatchEvent(
                new CustomEvent("praxis:rename-applied", {
                    detail: {oldName: symbol, newName: trimmed, filesChanged, occurrences: occurrencesApplied},
                })
            );
            toast({
                title: filesChanged > 0 ? `Renamed "${symbol}" → "${trimmed}"` : "Nothing to rename",
                description:
                    `${occurrencesApplied} occurrence${occurrencesApplied === 1 ? "" : "s"} in ${filesChanged} file${filesChanged === 1 ? "" : "s"}.` +
                    (undoEntries.length > 0 ? " Ctrl+Z restores every touched file." : "") +
                    (skipped.length > 0
                        ? ` ${skipped.length} file${skipped.length === 1 ? " was" : "s were"} skipped (${skipped.slice(0, 4).join(", ")}${skipped.length > 4 ? ", …" : ""}).`
                        : ""),
                variant: skipped.length > 0 ? "warning" : "success",
            });
            onApplied?.({
                filesChanged,
                occurrences: occurrencesApplied,
                oldName: symbol,
                newName: trimmed,
            });
            onClose();
        } catch (e) {
            setError((e as Error).message);
            setStage("preview");
        }
    }, [canApply, files, checked, symbol, trimmed, toast, onApplied, onClose]);

    /* ── Render helpers ──────────────────────────────────────────── */

    const renderOccurrenceRow = (f: PreviewFile, o: PreviewOccurrence) => {
        const key = occKey(f.folderSlug, f.fileSlug, o.line, o.col);
        const isChecked = checked.has(key);
        const proseRow = o.context === "comment" || o.context === "string";
        return (
            <li key={key} className="flex items-stretch hover:bg-accent/50 transition-colors">
                <div className="flex items-center pl-3 pr-1 shrink-0">
                    <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleOccurrence(f, o)}
                        disabled={stage === "applying"}
                        aria-label={`Include occurrence on line ${o.line}${proseRow ? ` (${o.context})` : ""}`}
                    />
                </div>
                <button
                    type="button"
                    className="flex-1 min-w-0 text-left px-2 py-1.5 flex items-start gap-2 disabled:opacity-60"
                    disabled={stage === "applying"}
                    title={onJumpTo ? "Jump to this occurrence" : undefined}
                    onClick={() => {
                        if (!onJumpTo) return;
                        onJumpTo(f.folderSlug, f.fileSlug, o.line);
                        onClose();
                    }}
                >
          <span className="text-[10px] text-muted-foreground font-mono shrink-0 mt-0.5 w-10 text-right">
            {o.line}
          </span>
                    <OccurrenceSnippet snippet={o.snippet} col={o.col} name={symbol}/>
                    <span className="flex flex-col items-end gap-0.5 shrink-0">
            {o.defSite ? (
                <Badge variant="outline"
                       className="text-[9px] px-1 py-0 border-emerald-600/40 text-emerald-700 dark:text-emerald-300">
                    def
                </Badge>
            ) : null}
                        {proseRow ? (
                            <Badge variant="outline"
                                   className="text-[9px] px-1 py-0 border-amber-600/40 text-amber-700 dark:text-amber-300">
                                {o.context}
                            </Badge>
                        ) : null}
          </span>
                </button>
            </li>
        );
    };

    /* ── Render ──────────────────────────────────────────────────── */

    const busy = stage === "loading" || stage === "applying";

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                    {stage === "input" ? <Pencil className="size-5"/> : <FileSearch className="size-5"/>}
                    Rename Symbol
                    <Badge variant="secondary" className="font-mono ml-1">{symbol}</Badge>
                    {stage === "preview" || stage === "applying" ? (
                        <>
                            <span className="text-muted-foreground text-sm font-normal">→</span>
                            <Badge variant="secondary" className="font-mono">{trimmed}</Badge>
                        </>
                    ) : null}
                </DialogTitle>
                <DialogDescription>
                    {stage === "input" ? (
                        <>
                            Preview every occurrence across the project before any
                            file is written. Comments and strings are listed but
                            excluded by default.
                        </>
                    ) : (
                        <>
                            {files.length === 0
                                ? "No occurrences found."
                                : `${summary.code + summary.text} code occurrence${summary.code + summary.text === 1 ? "" : "s"} in ${files.length} file${files.length === 1 ? "" : "s"}`}
                            {summary.comment + summary.string > 0
                                ? ` · ${summary.comment + summary.string} in comments/strings (off by default)`
                                : ""}
                            {summary.defSites > 0 ? ` · ${summary.defSites} definition site${summary.defSites === 1 ? "" : "s"}` : ""}
                            .
                        </>
                    )}
                </DialogDescription>
            </DialogHeader>

            {error ? (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                    <CircleAlert className="size-3.5"/> {error}
                </p>
            ) : null}

            {/* ── Stage: name input ───────────────────────────────────── */}
            {stage === "input" ? (
                <div className="grid gap-2">
                    <Label htmlFor="rename-preview-current">Current name</Label>
                    <Input
                        id="rename-preview-current"
                        value={symbol}
                        readOnly
                        className="font-mono bg-muted/40"
                    />
                    <Label htmlFor="rename-preview-new">New name</Label>
                    <Input
                        id="rename-preview-new"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && canScan) {
                                e.preventDefault();
                                void runScan();
                            }
                        }}
                        placeholder="new_name"
                        autoFocus
                        className="font-mono"
                        aria-invalid={trimmed.length > 0 && !validName}
                    />
                    {trimmed.length > 0 && !validName ? (
                        <p className="text-xs text-destructive">
                            Not a valid Python identifier.
                        </p>
                    ) : null}
                </div>
            ) : null}

            {/* ── Stage: scanning ─────────────────────────────────────── */}
            {stage === "loading" ? (
                <div className="flex-1 min-h-0 flex items-center justify-center py-10 text-sm text-muted-foreground">
                    <Loader2 className="size-5 animate-spin mr-2"/>
                    Scanning every file in the project for “{symbol}”…
                </div>
            ) : null}

            {/* ── Stage: preview / applying ──────────────────────────── */}
            {stage === "preview" || stage === "applying" ? (
                <>
                    <div className="flex items-center gap-2 flex-wrap text-xs min-h-5">
            <span className="text-muted-foreground">
              <strong className="text-foreground">{selectedCount}</strong> of{" "}
                {summary.code + summary.comment + summary.string + summary.text} occurrence
                {summary.code + summary.comment + summary.string + summary.text === 1 ? "" : "s"} selected
              across <strong className="text-foreground">{selectedFiles}</strong> file
                {selectedFiles === 1 ? "" : "s"}.
            </span>
                        {stage === "preview" ? (
                            <span className="flex items-center gap-1 ml-auto">
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={selectAll}
                        disabled={busy}>
                  Select all
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={clearAll}
                        disabled={busy}>
                  Clear
                </Button>
              </span>
                        ) : null}
                    </div>

                    {truncated ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                            <CircleAlert className="size-3.5"/>
                            Very large project — the list was capped. Run the rename
                            again afterwards for the remainder.
                        </p>
                    ) : null}

                    <div className="flex-1 min-h-0 rounded-md border overflow-hidden">
                        <ScrollArea className="h-full max-h-[52vh]">
                            {files.length === 0 ? (
                                <div
                                    className="flex items-center justify-center py-12 px-8 text-center text-sm text-muted-foreground max-w-[34rem] mx-auto">
                                    No occurrences of “{symbol}” were found anywhere in the project.
                                </div>
                            ) : (
                                <ul className="divide-y">
                                    {files.map((f) => {
                                        const fk = fileKey(f);
                                        const isCollapsed = collapsed.has(fk);
                                        const fileOccurrenceKeys = f.occurrences.map((o) =>
                                            occKey(f.folderSlug, f.fileSlug, o.line, o.col)
                                        );
                                        const allChecked = fileOccurrenceKeys.every((k) => checked.has(k));
                                        const someChecked = fileOccurrenceKeys.some((k) => checked.has(k));
                                        return (
                                            <li key={fk}>
                                                {/* File header: chevron + per-file master checkbox */}
                                                <div
                                                    className="px-3 py-2 bg-muted/40 flex items-center gap-2 text-xs sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/30">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-5 shrink-0"
                                                        aria-label={isCollapsed ? `Expand ${f.file}` : `Collapse ${f.file}`}
                                                        aria-expanded={!isCollapsed}
                                                        onClick={() => toggleCollapsed(fk)}
                                                        disabled={stage === "applying"}
                                                    >
                                                        {isCollapsed ? (
                                                            <ChevronRight className="size-3.5"/>
                                                        ) : (
                                                            <ChevronDown className="size-3.5"/>
                                                        )}
                                                    </Button>
                                                    <Checkbox
                                                        checked={allChecked ? true : someChecked ? "indeterminate" : false}
                                                        onCheckedChange={() => toggleFile(f)}
                                                        disabled={stage === "applying"}
                                                        aria-label={`Include all occurrences in ${f.file}`}
                                                        className="shrink-0"
                                                    />
                                                    <FileSearch className="size-3.5 text-emerald-500 shrink-0"/>
                                                    <span className="font-mono font-medium truncate" title={f.path}>
                            {f.file}
                          </span>
                                                    <span
                                                        className="text-muted-foreground truncate">in {f.folder}</span>
                                                    <Badge variant="secondary" className="ml-auto shrink-0">
                                                        {f.occurrences.length}
                                                    </Badge>
                                                </div>
                                                {!isCollapsed ? (
                                                    <ul className="divide-y">
                                                        {f.occurrences.map((o) => renderOccurrenceRow(f, o))}
                                                    </ul>
                                                ) : null}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </ScrollArea>
                    </div>
                </>
            ) : null}

            <DialogFooter className={cn("gap-2 sm:gap-0")}>
                {stage === "input" ? (
                    <>
                        <Button variant="outline" onClick={onClose} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={() => void runScan()} disabled={!canScan}>
                            Preview occurrences
                        </Button>
                    </>
                ) : null}
                {stage === "loading" ? (
                    <Button variant="outline" onClick={onClose} disabled>
                        Cancel
                    </Button>
                ) : null}
                {stage === "preview" ? (
                    <>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setFiles([]);
                                setChecked(new Set());
                                setStage("input");
                            }}
                        >
                            <ArrowLeft className="size-4"/>
                            Back
                        </Button>
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button onClick={() => void handleApply()} disabled={!canApply}>
                            Apply rename ({selectedCount})
                        </Button>
                    </>
                ) : null}
                {stage === "applying" ? (
                    <Button variant="outline" disabled>
                        <Loader2 className="size-4 animate-spin"/>
                        Applying…
                    </Button>
                ) : null}
            </DialogFooter>
        </>
    );
}
