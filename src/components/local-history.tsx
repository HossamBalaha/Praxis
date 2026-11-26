"use client";

import * as React from "react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {ScrollArea} from "@/components/ui/scroll-area";
import {ArrowLeftRight, Clock, Columns2, FileWarning, History, Loader2, RefreshCw, RotateCcw, X,} from "lucide-react";
import {cn} from "@/lib/utils";
import {useToast} from "@/hooks/use-toast";
import {diffLines, type DiffRow} from "@/components/compare-files-dialog";

interface Snapshot {
    id: string;
    ts: number;
    size: number;
}

interface LocalHistoryPanelProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    onRestore: () => void;
}

export function LocalHistoryPanel({
                                      open,
                                      onOpenChange,
                                      folderSlug,
                                      fileSlug,
                                      fileName,
                                      onRestore,
                                  }: LocalHistoryPanelProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-5xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="size-5"/>
                        Local History
                        <Badge variant="secondary" className="ml-1 font-mono">
                            {fileName}
                        </Badge>
                    </DialogTitle>
                    <DialogDescription>
                        Snapshots are saved automatically. Click a snapshot to view its
                        diff against the current file, then <strong>Restore</strong> to
                        revert.
                    </DialogDescription>
                </DialogHeader>
                {open && (
                    <LocalHistoryBody
                        folderSlug={folderSlug}
                        fileSlug={fileSlug}
                        fileName={fileName}
                        onRestore={onRestore}
                        onClose={() => onOpenChange(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function LocalHistoryBody({
                              folderSlug,
                              fileSlug,
                              fileName,
                              onRestore,
                              onClose,
                          }: {
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    onRestore: () => void;
    onClose: () => void;
}) {
    const {toast} = useToast();
    const [snapshots, setSnapshots] = React.useState<Snapshot[]>([]);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [diff, setDiff] = React.useState<string>("");
    // a failed diff fetch used to render as "No
    // differences — the snapshot matches the current file", a false
    // success message sitting directly above the Restore button. The
    // error is now tracked and displayed as an error.
    const [diffError, setDiffError] = React.useState<string | null>(null);
    const [loadingList, setLoadingList] = React.useState<boolean>(true);
    const [listError, setListError] = React.useState<string | null>(null);
    const [loadingDiff, setLoadingDiff] = React.useState<boolean>(false);
    const [restoring, setRestoring] = React.useState(false);
    // snapshot-vs-snapshot compare — the user picks two
    // snapshots (the ⧉ button on each row); the right pane switches to
    // a side-by-side diff of the OLDER (A) vs NEWER (B) contents.
    const [comparePair, setComparePair] = React.useState<string[]>([]);
    const [compareSwap, setCompareSwap] = React.useState(false);
    const [compareContents, setCompareContents] = React.useState<{
        byId: Record<string, string>;
    } | null>(null);
    const [compareLoading, setCompareLoading] = React.useState(false);
    const [compareError, setCompareError] = React.useState<string | null>(null);
    // the manual refresh discarded the AbortController
    // that refreshList returns, so a slower older response could
    // overwrite a newer one. Track the latest controller and abort the
    // previous request on every refresh.
    const listAbortRef = React.useRef<AbortController | null>(null);

    const refreshList = React.useCallback(() => {
        // Abort any in-flight list request so an older response can never
        // overwrite a newer one.
        listAbortRef.current?.abort();
        const controller = new AbortController();
        listAbortRef.current = controller;
        fetch(
            `/api/local-history/list?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`,
            {signal: controller.signal}
        )
            .then(async (res) => {
                const data = (await res.json()) as {
                    snapshots?: Snapshot[];
                    error?: string;
                };
                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                const list = data.snapshots ?? [];
                setSnapshots(list);
                setSelectedId((prev) =>
                    prev && list.some((s) => s.id === prev) ? prev : (list[0]?.id ?? null)
                );
                setListError(null);
            })
            .catch((err: Error) => {
                if (err.name === "AbortError") return;
                setListError(err.message);
                setSnapshots([]);
            })
            .finally(() => {
                setLoadingList(false);
            });
        return controller;
    }, [folderSlug, fileSlug]);

    React.useEffect(() => {
        const controller = refreshList();
        return () => controller.abort();
    }, [refreshList]);

    React.useEffect(() => {
        if (!selectedId) return;
        const controller = new AbortController();
        const url =
            `/api/local-history/diff?folder=${encodeURIComponent(folderSlug)}` +
            `&file=${encodeURIComponent(fileSlug)}&id=${encodeURIComponent(selectedId)}`;
        fetch(url, {signal: controller.signal})
            .then(async (res) => {
                if (!res.ok) {
                    const data = (await res.json()) as { error?: string };
                    throw new Error(data.error ?? `HTTP ${res.status}`);
                }
                return res.json() as Promise<{ diff?: string }>;
            })
            .then((data) => {
                setDiff(data.diff ?? "");
                setDiffError(null);
            })
            .catch((err: Error) => {
                if (err.name === "AbortError") return;
                // record the failure instead of pretending
                // the snapshot matches the current file.
                setDiff("");
                setDiffError(err.message);
            })
            .finally(() => setLoadingDiff(false));
        return () => {
            controller.abort();
            setDiff("");
            setDiffError(null);
            setLoadingDiff(false);
        };
    }, [selectedId, folderSlug, fileSlug]);

    const handleRestore = async () => {
        if (!selectedId) return;
        setRestoring(true);
        try {
            const restoreUrl =
                `/api/local-history/restore?folder=${encodeURIComponent(folderSlug)}` +
                `&file=${encodeURIComponent(fileSlug)}&id=${encodeURIComponent(selectedId)}`;
            const restoreRes = await fetch(restoreUrl);
            const restoreData = (await restoreRes.json()) as {
                ok?: boolean;
                content?: string;
                error?: string;
            };
            if (!restoreRes.ok || !restoreData.ok || restoreData.content === undefined) {
                throw new Error(restoreData.error ?? `HTTP ${restoreRes.status}`);
            }
            const writeRes = await fetch("/api/file-write", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    fileName,
                    content: restoreData.content,
                }),
            });
            if (!writeRes.ok) {
                const err = (await writeRes.json().catch(() => ({}))) as { error?: string };
                throw new Error(err.error ?? `HTTP ${writeRes.status}`);
            }
            toast({
                title: "Snapshot restored",
                description: `${fileName} reverted to ${new Date(Number(selectedId)).toLocaleString()}.`,
            });
            onRestore();
            onClose();
        } catch (err) {
            toast({
                title: "Restore failed",
                description: (err as Error).message,
                variant: "destructive",
            });
        } finally {
            setRestoring(false);
        }
    };

    const handleRefreshClick = () => {
        setLoadingList(true);
        setListError(null);
        refreshList();
    };

    const selectedTs = selectedId ? Number(selectedId) : null;

    /** add/remove a snapshot to the compare pair —
     *  first click pins A, second pins B, clicking a pinned one unpins
     *  it, a third fresh pick replaces A (oldest rotation). */
    const toggleComparePick = (id: string) => {
        setComparePair((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            if (prev.length >= 2) return [prev[1], id];
            return [...prev, id];
        });
    };

    // Fetch BOTH snapshot contents (the restore endpoint is a pure
    // read — the CLIENT writes on actual restore only).
    React.useEffect(() => {
        if (comparePair.length !== 2) {
            setCompareContents(null);
            setCompareError(null);
            return;
        }
        let cancelled = false;
        setCompareLoading(true);
        setCompareError(null);
        (async () => {
            try {
                const [ra, rb] = await Promise.all(
                    comparePair.map((id) =>
                        fetch(
                            `/api/local-history/restore?folder=${encodeURIComponent(folderSlug)}` +
                            `&file=${encodeURIComponent(fileSlug)}&id=${encodeURIComponent(id)}`
                        )
                    )
                );
                const da = (await ra.json()) as { ok?: boolean; content?: string; error?: string };
                const db = (await rb.json()) as { ok?: boolean; content?: string; error?: string };
                if (cancelled) return;
                if (!ra.ok || !da.ok || da.content === undefined) {
                    throw new Error(da.error ?? `snapshot A: HTTP ${ra.status}`);
                }
                if (!rb.ok || !db.ok || db.content === undefined) {
                    throw new Error(db.error ?? `snapshot B: HTTP ${rb.status}`);
                }
                setCompareContents({
                    byId: {[comparePair[0]]: da.content, [comparePair[1]]: db.content},
                });
            } catch (err) {
                if (!cancelled) {
                    setCompareContents(null);
                    setCompareError((err as Error).message);
                }
            } finally {
                if (!cancelled) setCompareLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [comparePair, folderSlug, fileSlug]);

    // The pair is displayed OLDER → NEWER unless swapped (git-diff
    // orientation: older on the left, additions on the right).
    const orderedPair = React.useMemo(() => {
        if (comparePair.length !== 2) return null;
        const [x, y] = [...comparePair].sort((p, q) => Number(p) - Number(q));
        return compareSwap ? {a: y, b: x} : {a: x, b: y};
    }, [comparePair, compareSwap]);

    const compareRows: DiffRow[] | null = React.useMemo(() => {
        if (!compareContents || !orderedPair) return null;
        const left = compareContents.byId[orderedPair.a];
        const right = compareContents.byId[orderedPair.b];
        if (left === undefined || right === undefined) return null;
        return diffLines(left.split("\n"), right.split("\n"));
    }, [compareContents, orderedPair]);

    const compareStats = React.useMemo(() => {
        if (!compareRows) return null;
        let added = 0;
        let removed = 0;
        for (const r of compareRows) {
            if (r.kind === "add") added++;
            if (r.kind === "del") removed++;
        }
        return {added, removed};
    }, [compareRows]);

    return (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 min-h-0">
            <div className="border rounded-md flex flex-col min-h-0">
                <div
                    className="px-2 py-1.5 border-b text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            Snapshots
              {/* compare pair status + clear */}
              {comparePair.length > 0 && (
                  <span className="normal-case font-medium text-muted-foreground flex items-center gap-1">
                {comparePair.length === 2 ? "· A+B pinned" : "· pick one more"}
                      <button
                          onClick={() => setComparePair([])}
                          className="p-0.5 rounded hover:bg-accent"
                          title="Clear the compare pair"
                          aria-label="Clear compare pair"
                      >
                  <X className="size-2.5"/>
                </button>
              </span>
              )}
          </span>
                    <button
                        onClick={handleRefreshClick}
                        disabled={loadingList}
                        className="p-1 rounded hover:bg-accent disabled:opacity-50"
                        title="Refresh"
                    >
                        <RefreshCw className={cn("size-3", loadingList && "animate-spin")}/>
                    </button>
                </div>
                <ScrollArea className="flex-1">
                    {loadingList && snapshots.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                            <Loader2 className="size-3 animate-spin"/> Loading…
                        </div>
                    ) : listError ? (
                        <div className="p-3 text-xs text-destructive">{listError}</div>
                    ) : snapshots.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground">
                            No local history yet. Snapshots are saved automatically when you
                            edit the file.
                        </div>
                    ) : (
                        <div className="p-1 flex flex-col gap-0.5">
                            {snapshots.map((s) => {
                                const pinIdx = comparePair.indexOf(s.id);
                                return (
                                    <div
                                        key={s.id}
                                        className={cn(
                                            "flex items-start gap-1 rounded-sm",
                                            selectedId === s.id && "bg-accent"
                                        )}
                                    >
                                        <button
                                            onClick={() => {
                                                setSelectedId(s.id);
                                                setLoadingDiff(true);
                                            }}
                                            className="flex-1 min-w-0 text-left px-2 py-1.5 rounded-sm text-xs hover:bg-accent/60 transition-colors"
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="size-3 text-muted-foreground"/>
                                                <span className="font-mono">
                          {new Date(s.ts).toLocaleTimeString()}
                        </span>
                                            </div>
                                            <div className="text-[10px] text-muted-foreground ml-4">
                                                {new Date(s.ts).toLocaleDateString()} · {s.size} B
                                            </div>
                                        </button>
                                        {/* pin this snapshot into the A/B compare
                        pair. A = amber (older), B = sky (newer) once both
                        are picked the diff appears on the right. */}
                                        <button
                                            onClick={() => toggleComparePick(s.id)}
                                            className={cn(
                                                "mt-1 mr-1.5 p-0.5 rounded transition-colors",
                                                pinIdx === 0
                                                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                                                    : pinIdx === 1
                                                        ? "bg-sky-500/20 text-sky-600 dark:text-sky-400"
                                                        : "text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                                            )}
                                            title={
                                                pinIdx === 0
                                                    ? "Pinned as side A (older) of the snapshot compare"
                                                    : pinIdx === 1
                                                        ? "Pinned as side B (newer) of the snapshot compare"
                                                        : "Compare this snapshot against another one (pin A, then B)"
                                            }
                                            aria-label={`Pin ${s.id} into the compare pair`}
                                        >
                                            <Columns2 className="size-3"/>
                                            {pinIdx >= 0 && (
                                                <span
                                                    className="text-[8px] font-bold ml-0.5">{pinIdx === 0 ? "A" : "B"}</span>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>
            </div>
            <div className="border rounded-md flex flex-col min-h-0">
                <div
                    className="px-2 py-1.5 border-b text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between gap-2">
                    {comparePair.length === 2 ? (
                        /* the A/B snapshot compare header. */
                        <span className="truncate flex items-center gap-1.5 normal-case">
              <Columns2 className="size-3"/>
              <span className="font-mono text-amber-600 dark:text-amber-400 truncate">
                A {new Date(Number(orderedPair?.a)).toLocaleTimeString()}
              </span>
              <span className="text-muted-foreground">vs</span>
              <span className="font-mono text-sky-600 dark:text-sky-400 truncate">
                B {new Date(Number(orderedPair?.b)).toLocaleTimeString()}
              </span>
                            {compareStats && (
                                <span className="flex items-center gap-1.5 ml-1 shrink-0">
                  <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">+{compareStats.added}</span>
                  <span className="text-red-600 dark:text-red-400 tabular-nums">−{compareStats.removed}</span>
                </span>
                            )}
            </span>
                    ) : (
                        <span className="truncate">
              Diff
                            {selectedTs !== null && (
                                <span className="ml-1 font-mono text-foreground normal-case">
                  {new Date(selectedTs).toLocaleString()}
                </span>
                            )}
                            {comparePair.length === 1 && (
                                <span className="ml-2 normal-case text-muted-foreground">
                  · pick one more snapshot to compare
                </span>
                            )}
            </span>
                    )}
                    <span className="flex items-center gap-1.5 shrink-0">
            {comparePair.length === 2 && (
                <>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCompareSwap((s) => !s)}
                        className="h-6 px-2 text-xs gap-1"
                        title="Swap sides A and B"
                    >
                        <ArrowLeftRight className="size-3"/>
                        Swap
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setComparePair([])}
                        className="h-6 px-2 text-xs gap-1"
                        title="Leave the snapshot-compare mode"
                    >
                        <X className="size-3"/>
                        Clear
                    </Button>
                </>
            )}
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleRestore}
                            disabled={!selectedId || restoring || comparePair.length === 2}
                            className="h-6 text-xs"
                            title={
                                comparePair.length === 2
                                    ? "Clear the compare pair first — restoring works in the single-snapshot mode"
                                    : undefined
                            }
                        >
              {restoring ? (
                  <Loader2 className="size-3 animate-spin"/>
              ) : (
                  <RotateCcw className="size-3"/>
              )}
                            Restore
            </Button>
          </span>
                </div>
                <ScrollArea className="flex-1">
                    {comparePair.length === 2 ? (
                        /* ── snapshot-vs-snapshot side-by-side diff ── */
                        compareLoading ? (
                            <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                                <Loader2 className="size-3 animate-spin"/> Loading both snapshots…
                            </div>
                        ) : compareError ? (
                            <div className="p-3 text-xs text-destructive">
                                Could not load snapshots: {compareError}
                            </div>
                        ) : !compareRows || compareRows.length === 0 ? (
                            <div className="p-3 text-xs text-emerald-600 dark:text-emerald-400">
                                The two snapshots are identical.
                            </div>
                        ) : (
                            <div className="font-mono text-[11px] leading-tight">
                                <div className="grid grid-cols-2 divide-x">
                                    {compareRows.map((r, i) => (
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
                                                    <span
                                                        className="w-2 shrink-0 select-none text-red-600 dark:text-red-400">
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
                        )
                    ) : loadingDiff ? (
                        <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                            <Loader2 className="size-3 animate-spin"/> Computing diff…
                        </div>
                    ) : !selectedId ? (
                        <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                            <FileWarning className="size-3.5"/>
                            Select a snapshot to view its diff.
                        </div>
                    ) : diffError ? (
                        <div className="p-3 text-xs text-destructive">
                            Could not load diff: {diffError}
                        </div>
                    ) : diff === "" ? (
                        <div className="p-3 text-xs text-emerald-600 dark:text-emerald-400">
                            No differences — the snapshot matches the current file.
                        </div>
                    ) : (
                        <pre className="text-[11px] font-mono leading-tight p-2 whitespace-pre-wrap break-words">
              {diff.split("\n").map((line, i) => (
                  <div
                      key={i}
                      className={cn(
                          "px-1",
                          line.startsWith("+++") || line.startsWith("---")
                              ? "text-muted-foreground font-semibold"
                              : line.startsWith("@@")
                                  ? "text-blue-500"
                                  : line.startsWith("+")
                                      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                                      : line.startsWith("-")
                                          ? "text-red-600 dark:text-red-400 bg-red-500/5"
                                          : "text-foreground"
                      )}
                  >
                      {line || " "}
                  </div>
              ))}
            </pre>
                    )}
                </ScrollArea>
            </div>
        </div>
    );
}
