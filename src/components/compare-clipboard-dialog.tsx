"use client";

import * as React from "react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {ClipboardPaste, FileCode2} from "lucide-react";

interface CompareClipboardDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    fileName: string;
    fileContent: string | null;
    clipboardText: string | null;
}

type DiffRow =
    | { kind: "same"; left: string; right: string }
    | { kind: "del"; left: string; right: null; leftLine: number }
    | { kind: "add"; left: null; right: string; rightLine: number };

/** LCS line diff, capped: beyond 1500 lines per side the files are
 * shown as a whole-file replace (no per-line pairing). */
function diffLines(a: string[], b: string[]): DiffRow[] {
    if (a.length <= 1500 && b.length <= 1500) {
        const n = a.length;
        const m = b.length;
        // dp[i][j] = LCS length of a[i..] and b[j..], flat Int32Array.
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
                rows.push({kind: "same", left: a[i], right: b[j]});
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
 * Compare ▸ With clipboard… — diffs the right-clicked file against
 * whatever text is currently on the OS clipboard (VS Code's "Compare
 * Active File with Clipboard"). Client-side LCS diff over lines with
 * a unified +/- rendering; the two sides are also identified with
 * line numbers so long files stay navigable.
 */
export function CompareClipboardDialog({
                                           open,
                                           onOpenChange,
                                           fileName,
                                           fileContent,
                                           clipboardText,
                                       }: CompareClipboardDialogProps) {
    const rows = React.useMemo(() => {
        if (fileContent == null || clipboardText == null) return [];
        return diffLines(fileContent.split("\n"), clipboardText.split("\n"));
    }, [fileContent, clipboardText]);

    const added = rows.filter((r) => r.kind === "add").length;
    const removed = rows.filter((r) => r.kind === "del").length;
    const identical =
        fileContent != null && clipboardText != null && fileContent === clipboardText;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ClipboardPaste className="size-5"/>
                        {fileName} Vs Clipboard
                    </DialogTitle>
                    <DialogDescription>
                        Line diff of the file against the current clipboard contents.
                    </DialogDescription>
                </DialogHeader>

                {clipboardText == null ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                        Clipboard could not be read. Grant clipboard permission (or copy some text
                        first), then reopen the comparison.
                    </p>
                ) : identical ? (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 py-6 text-center">
                        The file and the clipboard are identical.
                    </p>
                ) : (
                    <div className="flex items-center gap-3 text-[11px] pb-2 shrink-0">
            <span className="flex items-center gap-1">
              <FileCode2 className="size-3 text-amber-500"/> {fileName}
            </span>
                        <span className="text-muted-foreground">vs</span>
                        <span className="flex items-center gap-1">
              <ClipboardPaste className="size-3 text-muted-foreground"/> clipboard
            </span>
                        <span className="flex-1"/>
                        <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
              +{added}
            </span>
                        <span className="text-red-600 dark:text-red-400 tabular-nums">−{removed}</span>
                    </div>
                )}

                {rows.length > 0 && (
                    <div className="flex-1 min-h-0 overflow-y-auto rounded-md border font-mono text-[11px]">
                        {rows.map((r, i) => (
                            <div
                                key={i}
                                className={
                                    r.kind === "add"
                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                        : r.kind === "del"
                                            ? "bg-red-500/10 text-red-700 dark:text-red-300"
                                            : "text-muted-foreground"
                                }
                            >
                                <div className="flex items-start gap-2 px-2 py-px">
                  <span className="w-3 shrink-0 select-none text-muted-foreground/70">
                    {r.kind === "add" ? "+" : r.kind === "del" ? "−" : " "}
                  </span>
                                    <span className="w-10 shrink-0 select-none text-muted-foreground/60 tabular-nums">
                    {r.kind === "add" ? r.rightLine : r.kind === "del" ? r.leftLine : ""}
                  </span>
                                    <span className="whitespace-pre-wrap break-all min-w-0 flex-1">
                    {r.kind === "add" ? r.right : r.left}
                  </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
