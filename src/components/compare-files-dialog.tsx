"use client";

import * as React from "react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select";
import {Button} from "@/components/ui/button";
import {ArrowLeftRight, Columns2, ExternalLink, FileCode2, XCircle} from "lucide-react";

/** Minimal structural shapes the dialog needs from the folders tree. */
interface PickerFolder {
    name: string;
    slug: string;
    files: Array<{ name: string; slug: string; kind?: string }>;
}

interface CompareFilesDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    folders: PickerFolder[];
    /** Preselect (e.g. from the Explorer's "Compare with another file…"). */
    initialLeft?: { folderSlug: string; fileSlug: string } | null;
    initialRight?: { folderSlug: string; fileSlug: string } | null;
    /** the file currently open in the editor — when the dialog
     *  opens with only ONE side preselected, the other side auto-fills
     *  with it (the natural "compare X with what I'm looking at"
     *  flow). */
    currentFile?: { folderSlug: string; fileSlug: string } | null;
}

export type DiffRow =
    | { kind: "same"; left: string; right: string; leftLine: number; rightLine: number }
    | { kind: "del"; left: string; right: null; leftLine: number }
    | { kind: "add"; left: null; right: string; rightLine: number };

/** LCS line diff — same algorithm as the clipboard dialog, extended to
 *  carry both sides' line numbers for the two-pane gutter. Beyond 1500
 *  lines per side the files are shown as a whole-file replace.
 * exported — the Local History dialog reuses it for
 *  its snapshot-vs-snapshot side-by-side compare. */
export function diffLines(a: string[], b: string[]): DiffRow[] {
    if (a.length <= 1500 && b.length <= 1500) {
        const n = a.length;
        const m = b.length;
        const dp = new Int32Array((n + 1) * (m + 1));
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                dp[i * (m + 1) + j] =
                    a[i] === b[j]
                        ? dp[(i + 1) * (m + 1) + (j + 1)] + 1
                        : Math.max(
                            dp[(i + 1) * (m + 1) + j],
                            dp[i * (m + 1) + (j + 1)]
                        );
            }
        }
        const rows: DiffRow[] = [];
        let i = 0;
        let j = 0;
        while (i < n && j < m) {
            if (a[i] === b[j]) {
                rows.push({kind: "same", left: a[i], right: b[j], leftLine: i + 1, rightLine: j + 1});
                i++;
                j++;
            } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + (j + 1)]) {
                rows.push({kind: "del", left: a[i], right: null, leftLine: i + 1});
                i++;
            } else {
                rows.push({kind: "add", left: null, right: b[j], rightLine: j + 1});
                j++;
            }
        }
        while (i < n) {
            rows.push({kind: "del", left: a[i], right: null, leftLine: i + 1});
            i++;
        }
        while (j < m) {
            rows.push({kind: "add", left: null, right: b[j], rightLine: j + 1});
            j++;
        }
        return rows;
    }
    // Whole-file fallback.
    return [
        ...a.map((l, k) => ({kind: "del" as const, left: l, right: null, leftLine: k + 1})),
        ...b.map((l, k) => ({kind: "add" as const, left: null, right: l, rightLine: k + 1})),
    ];
}

/**
 * Compare Two Files… (Tools menu + the Explorer's
 * "Compare with another file…" context entry).
 *
 * Two file pickers (folder + file each), a Swap button, and a
 * SIDE-BY-SIDE line diff: unchanged lines on both panes, deletions
 * highlighted red on the left, additions green on the right, line
 * numbers in both gutters. Contents are fetched fresh from disk via
 * GET /api/code (the same JSON endpoint the clipboard compare and
 * the code viewer use) whenever either side changes.
 */
export function CompareFilesDialog({
                                       open,
                                       onOpenChange,
                                       folders,
                                       initialLeft,
                                       initialRight,
                                       currentFile,
                                   }: CompareFilesDialogProps) {
    const [leftFolder, setLeftFolder] = React.useState<string>("");
    const [leftFile, setLeftFile] = React.useState<string>("");
    const [rightFolder, setRightFolder] = React.useState<string>("");
    const [rightFile, setRightFile] = React.useState<string>("");
    const [leftContent, setLeftContent] = React.useState<string | null>(null);
    const [rightContent, setRightContent] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [fetchError, setFetchError] = React.useState<string | null>(null);

    // Apply preselections whenever the dialog (re)opens with them.
    React.useEffect(() => {
        if (!open) return;
        if (initialLeft) {
            setLeftFolder(initialLeft.folderSlug);
            setLeftFile(initialLeft.fileSlug);
        }
        if (initialRight) {
            setRightFolder(initialRight.folderSlug);
            setRightFile(initialRight.fileSlug);
        }
        // "Compare with…" flow — when exactly one side came
        // preselected and the other is empty, prefill the OTHER side with
        // the file currently open in the editor.
        if (currentFile && ((initialLeft && !initialRight) || (initialRight && !initialLeft))) {
            const alreadyLeft =
                initialLeft && initialLeft.folderSlug === currentFile.folderSlug &&
                initialLeft.fileSlug === currentFile.fileSlug;
            const alreadyRight =
                initialRight && initialRight.folderSlug === currentFile.folderSlug &&
                initialRight.fileSlug === currentFile.fileSlug;
            if (initialLeft && !alreadyLeft) {
                setRightFolder(currentFile.folderSlug);
                setRightFile(currentFile.fileSlug);
            } else if (initialRight && !alreadyRight) {
                setLeftFolder(currentFile.folderSlug);
                setLeftFile(currentFile.fileSlug);
            }
        }
        // A fresh open without preselections keeps the previous picks —
        // swapping files back-to-back is a normal workflow.
    }, [open, initialLeft, initialRight, currentFile]);

    // Fetch both sides whenever both are fully selected.
    React.useEffect(() => {
        if (!open || !leftFolder || !leftFile || !rightFolder || !rightFile) {
            setLeftContent(null);
            setRightContent(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setFetchError(null);
        (async () => {
            try {
                // fetch via /api/file (raw text, ANY file kind)
                // instead of /api/code — the code route is .py-only, so
                // comparing markdown/CSV/JSON files used to fail with "One of
                // the files could not be read."
                const [l, r] = await Promise.all([
                    fetch(
                        `/api/file?folder=${encodeURIComponent(leftFolder)}&file=${encodeURIComponent(leftFile)}`,
                        {cache: "no-store"}
                    ),
                    fetch(
                        `/api/file?folder=${encodeURIComponent(rightFolder)}&file=${encodeURIComponent(rightFile)}`,
                        {cache: "no-store"}
                    ),
                ]);
                if (cancelled) return;
                if (!l.ok || !r.ok) {
                    setFetchError("One of the files could not be read.");
                    setLeftContent(null);
                    setRightContent(null);
                    return;
                }
                const ld = await l.text();
                const rd = await r.text();
                if (cancelled) return;
                setLeftContent(ld);
                setRightContent(rd);
            } catch {
                if (!cancelled) setFetchError("Network error while reading the files.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, leftFolder, leftFile, rightFolder, rightFile]);

    const rows = React.useMemo(() => {
        if (leftContent == null || rightContent == null) return [];
        return diffLines(leftContent.split("\n"), rightContent.split("\n"));
    }, [leftContent, rightContent]);

    const added = rows.filter((r) => r.kind === "add").length;
    const removed = rows.filter((r) => r.kind === "del").length;
    const identical = leftContent != null && rightContent != null && leftContent === rightContent;

    const leftFolderName = folders.find((c) => c.slug === leftFolder)?.name ?? leftFolder;
    const rightFolderName = folders.find((c) => c.slug === rightFolder)?.name ?? rightFolder;
    const leftFileName = leftContent ? leftFile.replace(/-/g, " ") : "";
    const rightFileName = rightContent ? rightFile.replace(/-/g, " ") : "";

    const swap = () => {
        setLeftFolder(rightFolder);
        setLeftFile(rightFile);
        setRightFolder(leftFolder);
        setRightFile(leftFile);
    };

    const fileOptions = (folderSlug: string) =>
        folders.find((c) => c.slug === folderSlug)?.files ?? [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-6xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Columns2 className="size-5"/>
                        Compare Two Files
                    </DialogTitle>
                    <DialogDescription>
                        Pick two files — the diff updates as soon as both sides are selected.
                    </DialogDescription>
                </DialogHeader>

                {/* ── Pickers ─────────────────────────────────────────────── */}
                <div className="shrink-0 flex items-center gap-1.5">
                    <div className="flex-1 grid grid-cols-[minmax(90px,140px)_1fr] gap-1.5">
                        <Select value={leftFolder} onValueChange={(v) => {
                            setLeftFolder(v);
                            setLeftFile("");
                        }}>
                            <SelectTrigger className="h-7 text-xs" aria-label="Left side folder">
                                <SelectValue placeholder="Folder"/>
                            </SelectTrigger>
                            <SelectContent>
                                {folders.map((c) => (
                                    <SelectItem key={c.slug} value={c.slug} className="text-xs">
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={leftFile} onValueChange={setLeftFile} disabled={!leftFolder}>
                            <SelectTrigger className="h-7 text-xs" aria-label="Left side file">
                                <SelectValue placeholder="File"/>
                            </SelectTrigger>
                            <SelectContent>
                                {fileOptions(leftFolder).map((f) => (
                                    <SelectItem key={f.slug} value={f.slug} className="text-xs font-mono">
                                        {f.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={swap}
                        disabled={!leftFolder || !rightFolder}
                        aria-label="Swap the two sides"
                        title="Swap sides"
                    >
                        <ArrowLeftRight className="size-3.5"/>
                    </Button>
                    <div className="flex-1 grid grid-cols-[minmax(90px,140px)_1fr] gap-1.5">
                        <Select value={rightFolder} onValueChange={(v) => {
                            setRightFolder(v);
                            setRightFile("");
                        }}>
                            <SelectTrigger className="h-7 text-xs" aria-label="Right side folder">
                                <SelectValue placeholder="Folder"/>
                            </SelectTrigger>
                            <SelectContent>
                                {folders.map((c) => (
                                    <SelectItem key={c.slug} value={c.slug} className="text-xs">
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={rightFile} onValueChange={setRightFile} disabled={!rightFolder}>
                            <SelectTrigger className="h-7 text-xs" aria-label="Right side file">
                                <SelectValue placeholder="File"/>
                            </SelectTrigger>
                            <SelectContent>
                                {fileOptions(rightFolder).map((f) => (
                                    <SelectItem key={f.slug} value={f.slug} className="text-xs font-mono">
                                        {f.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* ── Status line ─────────────────────────────────────────── */}
                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex-1 min-w-0">
                        {fetchError ? (
                            <p className="text-xs text-red-600 dark:text-red-400 py-1">{fetchError}</p>
                        ) : loading ? (
                            <p className="text-xs text-muted-foreground py-1">Reading files…</p>
                        ) : identical ? (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 py-1">
                                The two files are identical.
                            </p>
                        ) : rows.length > 0 ? (
                            <p className="flex items-center gap-3 text-[11px] py-1">
                <span className="flex items-center gap-1 truncate">
                  <FileCode2 className="size-3 text-amber-500"/>
                    {leftFolderName}/{leftFileName || "—"}
                </span>
                                <span className="text-muted-foreground">vs</span>
                                <span className="flex items-center gap-1 truncate">
                  <FileCode2 className="size-3 text-sky-500"/>
                                    {rightFolderName}/{rightFileName || "—"}
                </span>
                                <span className="flex-1"/>
                                <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">+{added}</span>
                                <span className="text-red-600 dark:text-red-400 tabular-nums">−{removed}</span>
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground py-1">Select a file on each side.</p>
                        )}
                    </div>
                    {/* explicit cancel — a clear way
out of a comparison, not just the dialog X. */}
                    {leftContent != null && rightContent != null && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 text-xs shrink-0"
                            onClick={() => {
                                // Open the comparison in the EDITOR surface (the
                                // DiffView tab): side-by-side + word-level highlights.
                                // The right side carries its real file identity, so the
                                // surface is editable + saveable from the diff.
                                const rightInfo =
                                    fileOptions(rightFolder).find((f) => f.slug === rightFile);
                                window.dispatchEvent(new CustomEvent("praxis:open-diff", {
                                    detail: {
                                        title: `${leftFolderName}/${leftFileName} ↔ ${rightFolderName}/${rightFileName}`,
                                        leftLabel: `${leftFolderName}/${leftFileName}`,
                                        leftContent,
                                        rightLabel: `${rightFolderName}/${rightFileName}`,
                                        rightContent,
                                        rightFile: rightInfo
                                            ? {
                                                folderSlug: rightFolder,
                                                fileSlug: rightFile,
                                                kind: rightInfo.kind ?? "python"
                                            }
                                            : undefined,
                                    },
                                }));
                                onOpenChange(false);
                            }}
                            title="Open this comparison in the editor — side-by-side panes with word-level intra-line highlights"
                        >
                            <ExternalLink className="size-3.5"/> Open in editor
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground shrink-0"
                        onClick={() => onOpenChange(false)}
                        title="Cancel the comparison and close this dialog (Esc)"
                    >
                        <XCircle className="size-3.5"/> Cancel compare
                    </Button>
                </div>

                {/* ── Side-by-side diff ──────────────────────────────────── */}
                {rows.length > 0 && (
                    <div className="flex-1 min-h-0 overflow-y-auto rounded-md border font-mono text-[11px]">
                        <div className="grid grid-cols-2 divide-x">
                            {rows.map((r, i) => (
                                <React.Fragment key={i}>
                                    <div
                                        className={
                                            r.kind === "del"
                                                ? "bg-red-500/10 text-red-700 dark:text-red-300"
                                                : "text-muted-foreground"
                                        }
                                    >
                                        <div className="flex items-start gap-2 px-2 py-px min-h-[1.4em]">
                      <span className="w-8 shrink-0 select-none text-right text-muted-foreground/60 tabular-nums">
                        {r.kind === "add" ? "" : r.leftLine}
                      </span>
                                            <span className="w-2 shrink-0 select-none text-red-600 dark:text-red-400">
                        {r.kind === "del" ? "−" : ""}
                      </span>
                                            <span className="whitespace-pre-wrap break-all min-w-0 flex-1">
                        {r.kind === "add" ? "" : r.left}
                      </span>
                                        </div>
                                    </div>
                                    <div
                                        className={
                                            r.kind === "add"
                                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                                : "text-muted-foreground"
                                        }
                                    >
                                        <div className="flex items-start gap-2 px-2 py-px min-h-[1.4em]">
                      <span className="w-8 shrink-0 select-none text-right text-muted-foreground/60 tabular-nums">
                        {r.kind === "add" ? r.rightLine : r.kind === "same" ? r.rightLine : ""}
                      </span>
                                            <span
                                                className="w-2 shrink-0 select-none text-emerald-600 dark:text-emerald-400">
                        {r.kind === "add" ? "+" : ""}
                      </span>
                                            <span className="whitespace-pre-wrap break-all min-w-0 flex-1">
                        {r.kind === "del" ? "" : r.right}
                      </span>
                                        </div>
                                    </div>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
