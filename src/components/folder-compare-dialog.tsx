"use client";

import * as React from "react";
import {ArrowRightLeft, Check, FileDiff, Loader2} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";

/**
 * "Compare with another folder…" — side A/B pickers
 * over the folder list (+ optional sub-folder paths), the diff comes
 * from /api/folder-compare (recursive walk, relative-path match).
 */

interface FolderOption {
    slug: string;
    name: string;
}

interface CompareResult {
    ok: boolean;
    labelA: string;
    labelB: string;
    same: string[];
    modified: Array<{ path: string; sizeA: number; sizeB: number }>;
    onlyA: string[];
    onlyB: string[];
    counts: { same: number; modified: number; onlyA: number; onlyB: number };
}

interface FolderCompareDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folders: FolderOption[];
    /** Preselected side A (the folder the dialog was opened from). */
    initialFolderSlug?: string;
}

function formatBytes(n: number): string {
    if (n < 0) return "?";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function FolderCompareDialog({open, onOpenChange, folders, initialFolderSlug}: FolderCompareDialogProps) {
    const {toast} = useToast();
    const [slugA, setSlugA] = React.useState("");
    const [subA, setSubA] = React.useState("");
    const [slugB, setSlugB] = React.useState("");
    const [subB, setSubB] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [result, setResult] = React.useState<CompareResult | null>(null);

    React.useEffect(() => {
        if (open) {
            setSlugA(initialFolderSlug ?? folders[0]?.slug ?? "");
            setSubA("");
            setSlugB(folders.find((f) => f.slug !== (initialFolderSlug ?? folders[0]?.slug))?.slug ?? "");
            setSubB("");
            setResult(null);
        }
    }, [open, initialFolderSlug, folders]);

    const compare = async () => {
        if (!slugA || !slugB) {
            toast({title: "Pick both folders first", variant: "destructive"});
            return;
        }
        setBusy(true);
        setResult(null);
        try {
            const res = await fetch("/api/folder-compare", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folderA: slugA, subA, folderB: slugB, subB}),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
            setResult(json as CompareResult);
        } catch (err) {
            toast({title: "Compare failed", description: (err as Error).message, variant: "destructive"});
        } finally {
            setBusy(false);
        }
    };

    const picker = (side: "A" | "B") => {
        const slug = side === "A" ? slugA : slugB;
        const setSlug = side === "A" ? setSlugA : setSlugB;
        const sub = side === "A" ? subA : subB;
        const setSub = side === "A" ? setSubA : setSubB;
        return (
            <div className="space-y-1.5">
                <p className="text-xs font-medium">Side {side}</p>
                <select
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                >
                    {folders.map((f) => (
                        <option key={f.slug} value={f.slug}>{f.name}</option>
                    ))}
                </select>
                <Input
                    value={sub}
                    onChange={(e) => setSub(e.target.value)}
                    placeholder="sub-folder (optional, e.g. Sorting)"
                    className="h-8 text-xs"
                />
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileDiff className="size-4 text-emerald-500"/>
                        Compare Two Folders
                    </DialogTitle>
                    <DialogDescription>
                        Recursive diff by relative path — same / modified / only-in-A / only-in-B. Read-only.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    {picker("A")}
                    <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => void compare()}>
                        {busy ? <Loader2 className="size-3.5 animate-spin"/> : <ArrowRightLeft className="size-3.5"/>}
                        Compare
                    </Button>
                    {picker("B")}
                </div>

                {result && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
                                <Check className="size-3"/> {result.counts.same} same
                            </Badge>
                            <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400">
                                {result.counts.modified} modified
                            </Badge>
                            <Badge variant="outline" className="gap-1 text-sky-600 dark:text-sky-400">
                                {result.counts.onlyA} only in {result.labelA}
                            </Badge>
                            <Badge variant="outline" className="gap-1 text-indigo-600 dark:text-indigo-400">
                                {result.counts.onlyB} only in {result.labelB}
                            </Badge>
                        </div>

                        {(
                            [
                                ["Modified", result.modified.map((m) => `${m.path}  (${formatBytes(m.sizeA)} → ${formatBytes(m.sizeB)})`), "text-amber-600 dark:text-amber-400"],
                                [`Only in ${result.labelA}`, result.onlyA, "text-sky-600 dark:text-sky-400"],
                                [`Only in ${result.labelB}`, result.onlyB, "text-indigo-600 dark:text-indigo-400"],
                                ["Identical", result.same, "text-muted-foreground"],
                            ] as const
                        ).map(([title, list, cls]) => (
                            <details key={title} className="rounded-md border" open={title !== "Identical"}>
                                <summary className={cn("cursor-pointer px-2.5 py-1.5 text-xs font-medium", cls)}>
                                    {title} ({list.length})
                                </summary>
                                <ul className="px-3 pb-2 pt-0.5 max-h-40 overflow-auto">
                                    {list.length === 0 && <li className="text-[11px] text-muted-foreground">—</li>}
                                    {list.map((item) => (
                                        <li key={item} className="font-mono text-[11px] py-0.5 truncate">{item}</li>
                                    ))}
                                </ul>
                            </details>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
