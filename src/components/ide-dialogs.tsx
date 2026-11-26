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
import {Label} from "@/components/ui/label";
import {Badge} from "@/components/ui/badge";
import {ScrollArea} from "@/components/ui/scroll-area";
import {
    CircleAlert,
    CircleCheck,
    CircleX,
    CornerDownLeft,
    FileSearch,
    Info,
    Loader2,
    Pencil,
    Search,
    Stethoscope,
    Wand2,
    Wrench,
} from "lucide-react";
import {useToast} from "@/hooks/use-toast";

/* ================================================================== */
/*  FindUsagesDialog                                                   */

/* ================================================================== */

interface FtsHit {
    folder: string;
    folderSlug: string;
    file: string;
    fileSlug: string;
    line: number;
    snippet: string;
}

interface FindUsagesDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** Symbol name to search for across all folders. */
    symbol: string;
    /** Called with (folderSlug, fileSlug, line) when the user clicks a hit. */
    onJumpTo: (folderSlug: string, fileSlug: string, line: number) => void;
}

/**
 * Find Usages dialog — fetches every occurrence of `symbol` across all
 * folders via /api/full-text-search and lists them with file/line/
 * snippet. Clicking a row fires `onJumpTo(folderSlug, fileSlug, line)`
 * so the parent can navigate the file viewer + scroll to the line.
 *
 * Re-fetches whenever the dialog opens or the symbol changes.
 */
export function FindUsagesDialog({
                                     open,
                                     onOpenChange,
                                     symbol,
                                     onJumpTo,
                                 }: FindUsagesDialogProps) {
    // Radix Dialog unmounts its content (and thus the FindUsagesResults
    // child below) when `open` is false, then remounts it fresh on the
    // next open. Mounting the child fires its useEffect, which kicks off
    // the fetch — so we don't need an effect here that depends on `open`,
    // and we avoid the setState-in-effect cascading-render pitfall that
    // an `open`-driven effect would create.
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Search className="size-5"/>
                        Find Usages
                        {symbol && (
                            <Badge variant="secondary" className="ml-1 font-mono">
                                {symbol}
                            </Badge>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        Searching every <code>.py</code> file across all folders for
                        occurrences of this symbol.
                    </DialogDescription>
                </DialogHeader>

                {open && (
                    <FindUsagesResults symbol={symbol} onJumpTo={onJumpTo} onClose={() => onOpenChange(false)}/>
                )}
            </DialogContent>
        </Dialog>
    );
}

/**
 * Inner results list + fetcher. Mounted only while the dialog is open,
 * so its initial fetch fires from mount (a perfectly fine place to
 * kick off a side effect) rather than from a state-driven useEffect.
 */
function FindUsagesResults({
                               symbol,
                               onJumpTo,
                               onClose,
                           }: {
    symbol: string;
    onJumpTo: (folderSlug: string, fileSlug: string, line: number) => void;
    onClose: () => void;
}) {
    const [hits, setHits] = React.useState<FtsHit[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    // Fetch on mount + whenever `symbol` changes while mounted.
    React.useEffect(() => {
        if (!symbol) {
            return;
        }
        const controller = new AbortController();
        const url = `/api/full-text-search?q=${encodeURIComponent(symbol)}&limit=100`;
        fetch(url, {signal: controller.signal})
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json() as Promise<{ hits?: FtsHit[] }>;
            })
            .then((data) => {
                setHits(data.hits ?? []);
            })
            .catch((err: Error) => {
                if (err.name === "AbortError") return;
                setError(err.message);
                setHits([]);
            })
            .finally(() => {
                setLoading(false);
            });
        return () => {
            controller.abort();
        };
    }, [symbol]);

    return (
        <>
            <div className="flex-1 min-h-0 rounded-md border overflow-hidden">
                <ScrollArea className="h-full max-h-[55vh]">
                    {loading ? (
                        <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="size-4 animate-spin"/>
                            Searching…
                        </div>
                    ) : error ? (
                        <div className="p-4 text-sm text-destructive">
                            Search failed: {error}
                        </div>
                    ) : hits.length === 0 ? (
                        <div
                            className="flex items-center justify-center text-center px-8 py-12 text-sm text-muted-foreground">
                            {symbol
                                ? `No occurrences of “${symbol}” found.`
                                : "No symbol selected."}
                        </div>
                    ) : (
                        <ul className="divide-y">
                            {hits.map((hit, idx) => (
                                <li key={`${hit.folderSlug}/${hit.fileSlug}/${hit.line}/${idx}`}>
                                    <button
                                        onClick={() => {
                                            onJumpTo(hit.folderSlug, hit.fileSlug, hit.line);
                                            onClose();
                                        }}
                                        className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-start gap-2"
                                    >
                                        <FileSearch className="size-4 text-emerald-500 shrink-0 mt-0.5"/>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-mono font-medium truncate">
                          {hit.file}
                        </span>
                                                <span className="text-muted-foreground truncate">
                          in {hit.folder}
                        </span>
                                                <span className="text-muted-foreground font-mono shrink-0">
                          L{hit.line}
                        </span>
                                            </div>
                                            <pre
                                                className="text-[11px] text-muted-foreground font-mono mt-1 whitespace-pre-wrap break-all">
                        {hit.snippet.split("\n").filter(Boolean).join(" ⏎ ")}
                      </pre>
                                        </div>
                                        <CornerDownLeft className="size-3 text-muted-foreground shrink-0 mt-1"/>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </ScrollArea>
            </div>

            <DialogFooter className="text-xs text-muted-foreground">
                {hits.length > 0 && (
                    <span>
            {hits.length} occurrence{hits.length === 1 ? "" : "s"} across{" "}
                        {new Set(hits.map((h) => `${h.folderSlug}/${h.fileSlug}`)).size}{" "}
                        file
                        {new Set(hits.map((h) => `${h.folderSlug}/${h.fileSlug}`)).size === 1
                            ? ""
                            : "s"}
                        .
          </span>
                )}
                <Button variant="outline" onClick={onClose}>
                    Close
                </Button>
            </DialogFooter>
        </>
    );
}

/* ================================================================== */
/*  RenameDialog                                                       */

/* ================================================================== */

interface RenameDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** Current symbol name (read-only display + default for the input). */
    symbol: string;
    /**
     * Called with (oldName, newName) on confirm. The parent performs
     * the actual rename (typically a project-wide find-and-replace on
     * word boundaries). Resolves when the rename is done; rejects on
     * error.
     */
    onRename: (oldName: string, newName: string) => Promise<void>;
}

/**
 * Rename dialog — shows the current symbol name and a single input
 * for the new name. On confirm, calls `onRename(oldName, newName)`
 * and disables itself + shows a spinner until the promise settles.
 *
 * The dialog does NOT perform the rename itself — the parent owns the
 * actual text transformation (so it can apply word-boundary matching,
 * exclude strings/comments, refresh the editor, etc.).
 */
export function RenameDialog({
                                 open,
                                 onOpenChange,
                                 symbol,
                                 onRename,
                             }: RenameDialogProps) {
    // The actual form state lives in <RenameForm>, which is only
    // mounted while the dialog is open. Mounting it fresh on each open
    // resets the input to the current symbol — no useEffect needed,
    // so we avoid the setState-in-effect pitfall.
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                {open && (
                    <RenameForm
                        symbol={symbol}
                        onRename={onRename}
                        onClose={() => onOpenChange(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function RenameForm({
                        symbol,
                        onRename,
                        onClose,
                    }: {
    symbol: string;
    onRename: (oldName: string, newName: string) => Promise<void>;
    onClose: () => void;
}) {
    const {toast} = useToast();
    // Initialize the input to the current symbol — since this component
    // is freshly mounted every time the dialog opens, this gives us the
    // "reset on open" behavior for free.
    const [newName, setNewName] = React.useState(symbol);
    const [busy, setBusy] = React.useState(false);

    const trimmed = newName.trim();
    const canSubmit = !busy && trimmed.length > 0 && trimmed !== symbol;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        try {
            await onRename(symbol, trimmed);
            toast({
                title: "Renamed",
                description: `${symbol} → ${trimmed}`,
                variant: "success",
            });
            onClose();
        } catch (err) {
            toast({
                title: "Rename failed",
                description: (err as Error).message,
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Pencil className="size-5"/>
                    Rename Symbol
                </DialogTitle>
                <DialogDescription>
                    Rename the symbol across every file in the project. The new name
                    must be a valid Python identifier.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
                <Label htmlFor="rename-current">Current name</Label>
                <Input
                    id="rename-current"
                    value={symbol}
                    readOnly
                    className="font-mono bg-muted/40"
                />
                <Label htmlFor="rename-new">New name</Label>
                <Input
                    id="rename-new"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && canSubmit) handleSubmit();
                    }}
                    placeholder="new_name"
                    autoFocus
                    className="font-mono"
                    aria-invalid={!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) && trimmed.length > 0}
                />
                {trimmed.length > 0 &&
                    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) && (
                        <p className="text-xs text-destructive">
                            Not a valid Python identifier.
                        </p>
                    )}
            </div>

            <DialogFooter>
                <Button
                    variant="outline"
                    onClick={onClose}
                    disabled={busy}
                >
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!canSubmit}>
                    {busy ? (
                        <>
                            <Loader2 className="size-4 animate-spin"/>
                            Renaming…
                        </>
                    ) : (
                        "Rename"
                    )}
                </Button>
            </DialogFooter>
        </>
    );
}

/* ================================================================== */
/* QuickFixesDialog */

/* ================================================================== */

export interface QuickFixDiagnostic {
    line: number;
    col?: number;
    severity: "error" | "warning" | "info" | "note";
    message: string;
}

interface QuickFixesDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** Diagnostics for the current file (from lint / typecheck). */
    diagnostics: QuickFixDiagnostic[];
}

/**
 * Quick Fixes dialog — lists the diagnostics for the current file and
 * offers one-click access to the format and lint tools by dispatching
 * `praxis:format-current` and `praxis:lint-current` window events.
 *
 * The actual format / lint handlers live in the parent (page.tsx),
 * which listens for these events and runs the corresponding tools.
 * This keeps the dialog decoupled from the specific tool wiring.
 */
export function QuickFixesDialog({
                                     open,
                                     onOpenChange,
                                     diagnostics,
                                 }: QuickFixesDialogProps) {
    const dispatchAction = (eventName: "praxis:format-current" | "praxis:lint-current") => {
        window.dispatchEvent(new CustomEvent(eventName));
        onOpenChange(false);
    };

    // Group diagnostics by severity for quick scanning.
    const sorted = React.useMemo(() => {
        const order: Record<QuickFixDiagnostic["severity"], number> = {
            error: 0,
            warning: 1,
            info: 2,
            note: 3,
        };
        return [...diagnostics].sort((a, b) => {
            const so = order[a.severity] - order[b.severity];
            if (so !== 0) return so;
            return a.line - b.line;
        });
    }, [diagnostics]);

    const counts = React.useMemo(() => {
        const c = {error: 0, warning: 0, info: 0, note: 0};
        for (const d of diagnostics) c[d.severity]++;
        return c;
    }, [diagnostics]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wrench className="size-5"/>
                        Quick Fixes
                    </DialogTitle>
                    <DialogDescription>
                        Diagnostics for the current file, plus one-click actions to format
                        and re-lint it.
                    </DialogDescription>
                </DialogHeader>

                {/* Quick action buttons */}
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => dispatchAction("praxis:format-current")}
                    >
                        <Wand2 className="size-4"/>
                        Format file
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => dispatchAction("praxis:lint-current")}
                    >
                        <Stethoscope className="size-4"/>
                        Re-lint file
                    </Button>
                    {(counts.error > 0 || counts.warning > 0) && (
                        <div className="ml-auto flex items-center gap-1.5 text-xs">
                            {counts.error > 0 && (
                                <Badge variant="destructive">{counts.error} error{counts.error === 1 ? "" : "s"}</Badge>
                            )}
                            {counts.warning > 0 && (
                                <Badge variant="secondary" className="text-amber-600 dark:text-amber-400">
                                    {counts.warning} warning{counts.warning === 1 ? "" : "s"}
                                </Badge>
                            )}
                        </div>
                    )}
                </div>

                {/* Diagnostics list */}
                <div className="flex-1 min-h-0 rounded-md border overflow-hidden">
                    <ScrollArea className="h-full max-h-[50vh]">
                        {sorted.length === 0 ? (
                            <div
                                className="flex items-center justify-center text-center gap-2 px-8 py-12 text-sm text-muted-foreground">
                                <CircleCheck className="size-4 text-emerald-500"/>
                                No diagnostics — the file is clean.
                            </div>
                        ) : (
                            <ul className="divide-y">
                                {sorted.map((d, idx) => (
                                    <li
                                        key={`${d.line}-${idx}`}
                                        className="px-3 py-2 flex items-start gap-2 text-sm"
                                    >
                                        <SeverityIcon severity={d.severity}/>
                                        <div className="min-w-0 flex-1">
                                            <span className="text-foreground">{d.message}</span>
                                            <span className="ml-2 text-[10px] text-muted-foreground font-mono shrink-0">
                        L{d.line}
                                                {d.col != null ? `:${d.col}` : ""}
                      </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </ScrollArea>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Severity → icon + colour. */
function SeverityIcon({severity}: { severity: QuickFixDiagnostic["severity"] }) {
    switch (severity) {
        case "error":
            return <CircleX className="size-4 text-destructive shrink-0 mt-0.5"/>;
        case "warning":
            return <CircleAlert className="size-4 text-amber-500 shrink-0 mt-0.5"/>;
        case "info":
            return <Info className="size-4 text-blue-500 shrink-0 mt-0.5"/>;
        case "note":
            return <Info className="size-4 text-muted-foreground shrink-0 mt-0.5"/>;
        default:
            return <Info className="size-4 text-muted-foreground shrink-0 mt-0.5"/>;
    }
}

/* Re-export for type-only consumers. */
export type {FtsHit};
