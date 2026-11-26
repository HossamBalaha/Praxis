"use client";

import * as React from "react";
import {Dialog, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {ResizableDialogContent} from "@/components/ui/resizable-dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {ScrollArea} from "@/components/ui/scroll-area";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {Archive, ArchiveRestore, CircleAlert, Loader2, RefreshCw, Trash2, Undo2} from "lucide-react";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
// The diff panel's own multi-file renderer + section splitter — the
// stash preview reuses the exact side-by-side machinery the Git Diff
// tab uses, so previews look and behave identically to the panel.
import {MultiFileDiffPreview, splitFileDiffSections} from "@/components/git-diff-panel";

/* ================================================================== */
/*  Types                                                               */

/* ================================================================== */

/** One structured row of `git stash list` (parsed by /api/git-command's
 *  stashList action from --format=%gd,%gs,%ct,%h). */
interface StashEntry {
    /** "stash@{0}" — the reflog selector. */
    ref: string;
    /** 0-based stash number. */
    index: number;
    /** Reflog subject — "On main: my message" / "WIP on main: …". */
    message: string;
    /** Unix seconds of the stash commit's date. */
    timestamp: number;
    /** Short sha of the stash commit. */
    shortSha: string;
}

/** Compact relative-date label (same buckets as the log dialog). */
function stashRelTime(unixSec: number): string {
    const diff = Date.now() / 1000 - unixSec;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} d ago`;
    if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))} mo ago`;
    return `${Math.floor(diff / (86400 * 365))} y ago`;
}

/* ================================================================== */
/*  GitStashDialog                                                      */

/* ================================================================== */

/**
 * The stash stack manager — a real panel replacing the old
 * prompt-and-toast pop/push flow:
 *
 *   ▸ PUSH — an optional-message input + one button (git stash push
 *     -m; the diff panel's overflow menu keeps its quick
 *     "Stash push…"/"Stash pop (latest)" actions too);
 *   ▸ LIST — every stash with its ref, message, short sha and date;
 *   ▸ PREVIEW — click a row and `git stash show -p` renders in the
 *     right pane through the diff panel's own multi-file machinery;
 *   ▸ POP / APPLY / DROP — per-row actions; Pop/Apply rewrite the
 *     working tree so the host is notified (the footer's branch
 *     picker wires onWorktreeChanged to the page's branch-change
 *     refresh: git status + the file tree), and every mutation
 *     broadcasts praxis:git-refresh so the other git surfaces reload.
 *
 * Mounted by the footer's branch picker (it outlives the diff panel's
 * tab, which disappears once a push leaves the tree clean) and opened
 * from there or via the praxis:git-stash-open event.
 */
export function GitStashDialog({
                                   open,
                                   onOpenChange,
                                   onWorktreeChanged,
                               }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** Fired after push/pop/apply — those rewrite the working tree, so
     *  the host re-fetches git status + the file tree (the picker wires
     *  it to the page's onBranchChanged handler, the same refresh a
     *  branch switch triggers). */
    onWorktreeChanged?: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <ResizableDialogContent id="git-stash-dialog" defaultW={900} defaultH={560} className="flex flex-col">
                {/* Inner manager mounted only while open — Radix unmounts the
         *  content when closed, so the list/selection/push-message all
         *  reset to fresh defaults per open, the commit dialog's
         *  pattern. */}
                {open && <StashManager onWorktreeChanged={onWorktreeChanged}/>}
            </ResizableDialogContent>
        </Dialog>
    );
}

/* ================================================================== */
/*  StashManager — inner (mounted only while the dialog is open)        */

/* ================================================================== */

function StashManager({
                          onWorktreeChanged,
                      }: {
    onWorktreeChanged?: () => void;
}) {
    const {toast} = useToast();

    /* ── list state ────────────────────────────────────────── */
    const [entries, setEntries] = React.useState<StashEntry[] | null>(null);
    const [listError, setListError] = React.useState<string | null>(null);
    /** Selected stash index (the N of stash@{N}) — null = no preview. */
    const [selected, setSelected] = React.useState<number | null>(null);

    /* ── preview state (git stash show -p) ──────────────────── */
    const [patch, setPatch] = React.useState<string | null>(null);
    const [patchLoading, setPatchLoading] = React.useState(false);
    const [patchError, setPatchError] = React.useState<string | null>(null);
    const [patchTruncated, setPatchTruncated] = React.useState(false);

    /* ── mutation state ─────────────────────────────────────── */
    /** Label of the in-flight stash command ("Push" / "Pop" / "Apply" /
     *  "Drop") — one flag disables every action button so two stash
     *  operations can never interleave. */
    const [busy, setBusy] = React.useState<string | null>(null);
    const [pushMsg, setPushMsg] = React.useState("");
    /** Stash pending the drop confirmation — null = no confirm. */
    const [confirmDrop, setConfirmDrop] = React.useState<StashEntry | null>(null);

    /* ── list loader ──────────────────────────────────────
     * POST /api/git-command { action: "stashList" } — returns BOTH the
     * raw lines (the diff panel's toast still prints those) and the
     * structured entries this dialog renders. Selection cleanup: when
     * the selected index vanished from the fresh list the preview
     * clears (a pop/drop shifts every higher index — the caller
     * explicitly clears the selection there, this covers external
     * changes like a second tab). */
    const loadList = React.useCallback(async () => {
        setListError(null);
        try {
            const res = await fetch("/api/git-command", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "stashList"}),
            });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                entries?: StashEntry[];
            };
            if (!res.ok || !data.ok || !Array.isArray(data.entries)) {
                setListError(data.error ?? "Could not list stashes.");
                setEntries([]);
                setSelected(null);
                return;
            }
            setEntries(data.entries);
            setSelected((cur) =>
                cur === null || data.entries!.some((e) => e.index === cur) ? cur : null
            );
        } catch (err) {
            setListError((err as Error).message || "Could not list stashes.");
            setEntries([]);
            setSelected(null);
        }
    }, []);

    // Initial load on mount.
    React.useEffect(() => {
        void loadList();
    }, [loadList]);

    // Other git surfaces broadcast praxis:git-refresh after every
    // mutation (branch deletes, the diff panel's sync commands) — reload
    // the list while this dialog is open so it never goes stale.
    React.useEffect(() => {
        const onRefresh = () => void loadList();
        window.addEventListener("praxis:git-refresh", onRefresh);
        return () => window.removeEventListener("praxis:git-refresh", onRefresh);
    }, [loadList]);

    /* ── preview loader ──────────────────────────────────
     * Fires when a row is clicked (or re-clicked). `git stash show -p`
     * returns the stash's whole multi-file patch, capped at 256 KB
     * server-side. */
    React.useEffect(() => {
        if (selected === null) {
            setPatch(null);
            setPatchError(null);
            return;
        }
        let cancelled = false;
        setPatchLoading(true);
        setPatchError(null);
        setPatch(null);
        setPatchTruncated(false);
        (async () => {
            try {
                const res = await fetch("/api/git-command", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({action: "stashShow", index: selected}),
                });
                const data = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string;
                    patch?: string;
                    truncated?: boolean;
                };
                if (cancelled) return;
                if (!res.ok || !data.ok) {
                    throw new Error(data.error ?? `HTTP ${res.status}`);
                }
                setPatch(typeof data.patch === "string" ? data.patch : "");
                setPatchTruncated(data.truncated === true);
            } catch (err) {
                if (!cancelled) setPatchError((err as Error).message);
            } finally {
                if (!cancelled) setPatchLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [selected]);

    /* ── generic mutation runner ────────────────────────
     * POST /api/git-command, toast the result, reload the list, and
     * broadcast praxis:git-refresh so the branch picker / log dialog /
     * diff panel reload too. `clearSelection` covers the index-shifting
     * commands (push/pop/drop) where the old stash@{N} now names a
     * DIFFERENT stash — safest to drop the preview than guess the shift;
     * `worktree` covers the tree-rewriting ones (push/pop/apply) and
     * notifies the host so the page's git status + file tree refresh. */
    const runStash = React.useCallback(
        async (
            body: Record<string, unknown>,
            title: string,
            opts: { clearSelection?: boolean; worktree?: boolean }
        ) => {
            if (busy) return;
            setBusy(title);
            try {
                const res = await fetch("/api/git-command", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(body),
                });
                const data = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string;
                    output?: string;
                };
                if (!res.ok || !data.ok) {
                    toast({title, description: data.error ?? `HTTP ${res.status}`, variant: "destructive"});
                    return;
                }
                toast({
                    title,
                    description: (data.output ?? "Done.").slice(0, 400) || "Done.",
                });
                if (opts.clearSelection) setSelected(null);
                await loadList();
                window.dispatchEvent(new Event("praxis:git-refresh"));
                if (opts.worktree) onWorktreeChanged?.();
            } catch (err) {
                toast({title, description: (err as Error).message, variant: "destructive"});
            } finally {
                setBusy(null);
            }
        },
        [busy, loadList, onWorktreeChanged, toast]
    );

    const pushStash = () => {
        const msg = pushMsg.trim().slice(0, 200);
        setPushMsg("");
        void runStash({action: "stashPush", message: msg}, "Stash push", {
            clearSelection: true,
            worktree: true,
        });
    };

    const popStash = (e: StashEntry) => {
        void runStash({action: "stashPop", index: e.index}, `Pop ${e.ref}`, {
            clearSelection: true,
            worktree: true,
        });
    };

    const applyStash = (e: StashEntry) => {
        // Apply keeps the entry on the stack — keep the preview selected
        // (it still describes the same stash after the apply).
        void runStash({action: "stashApply", index: e.index}, `Apply ${e.ref}`, {
            worktree: true,
        });
    };

    const dropStash = (e: StashEntry) => {
        void runStash({action: "stashDrop", index: e.index}, `Drop ${e.ref}`, {
            clearSelection: true,
        });
    };

    const listCount = entries?.length ?? 0;

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Archive className="size-5"/>
                    Stashes
                </DialogTitle>
                <DialogDescription>
                    The stash stack — push the current changes (optionally with a message), pop or apply
                    entries, drop them, and preview each stash&apos;s diff before applying.
                </DialogDescription>
            </DialogHeader>

            {/* Push row — the full-dialog counterpart of the diff panel's
       * quick "Stash push…" (which stays where it lives). */}
            <div className="flex items-center gap-1.5 shrink-0">
                <Input
                    value={pushMsg}
                    onChange={(e) => setPushMsg(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !busy) pushStash();
                    }}
                    placeholder="optional stash message (Enter to push)"
                    className="h-7 text-xs font-mono flex-1 min-w-0"
                    aria-label="Optional stash message"
                    disabled={!!busy}
                />
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-[11px] px-2 shrink-0"
                    onClick={pushStash}
                    disabled={!!busy}
                    title="git stash push -m — save the current staged + unstaged changes and revert the working tree"
                >
                    {busy === "Stash push" ? <Loader2 className="size-3 animate-spin"/> : <Archive className="size-3"/>}
                    Push stash
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() => void loadList()}
                    disabled={!!busy}
                    aria-label="Refresh the stash list"
                    title="Refresh the stash list"
                >
                    <RefreshCw className="size-3.5"/>
                </Button>
            </div>

            {/* Body — list (left) | preview (right), the log dialog's grid
       * shape. Narrow screens stack the two panes (the list gets its
       * own capped scroll box so the preview stays reachable). */}
            <div
                className="flex-1 min-h-0 grid gap-2 max-sm:grid-rows-[auto_1fr] sm:grid-cols-[minmax(280px,340px)_1fr] grid-cols-1">
                {/* ── Stash list ──────────────────────────────────── */}
                <div className="min-h-0 max-sm:max-h-44 rounded-md border overflow-y-auto">
                    {listError ? (
                        <p className="flex items-start gap-1.5 p-3 text-[11px] text-muted-foreground">
                            <CircleAlert className="size-3.5 shrink-0 mt-0.5"/>
                            {listError}
                        </p>
                    ) : entries === null ? (
                        <p className="p-3 text-[11px] text-muted-foreground">Reading the stash list…</p>
                    ) : entries.length === 0 ? (
                        <p className="p-3 text-[11px] text-muted-foreground">
                            No stashes yet — push one above (or from the Git toolbar&apos;s quick actions) to
                            park your current changes.
                        </p>
                    ) : (
                        entries.map((e) => (
                            // The whole row selects for the preview; the action
                            // buttons stopPropagation so Pop/Apply/Drop never also
                            // change the selection.
                            <div
                                key={`${e.ref}`}
                                className={cn(
                                    "px-2 py-1.5 border-b last:border-b-0 cursor-pointer transition-colors",
                                    selected === e.index ? "bg-accent" : "hover:bg-accent/50"
                                )}
                                onClick={() => setSelected(e.index)}
                                title={`${e.ref} — ${e.message} (click to preview the diff)`}
                                role="button"
                                aria-pressed={selected === e.index}
                                tabIndex={0}
                                onKeyDown={(ev) => {
                                    if (ev.key === "Enter" || ev.key === " ") {
                                        ev.preventDefault();
                                        setSelected(e.index);
                                    }
                                }}
                            >
                                <div className="flex items-center gap-1.5">
                                    <span
                                        className="text-[10px] font-mono text-muted-foreground shrink-0">{e.ref}</span>
                                    <span className="text-xs truncate flex-1 min-w-0" title={e.message}>
                    {e.message || "(no message)"}
                  </span>
                                    <span className="text-[9px] text-muted-foreground shrink-0"
                                          title={new Date(e.timestamp * 1000).toLocaleString()}>
                    {stashRelTime(e.timestamp)}
                  </span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-1">
                                    <span
                                        className="text-[9px] font-mono text-muted-foreground/70 shrink-0">{e.shortSha}</span>
                                    <span className="flex-1"/>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 gap-1 text-[9px] px-1.5"
                                        disabled={!!busy}
                                        onClick={(ev) => {
                                            ev.stopPropagation();
                                            popStash(e);
                                        }}
                                        title="git stash pop — apply this stash to the working tree AND remove it from the stack"
                                    >
                                        {busy === `Pop ${e.ref}` ? <Loader2 className="size-2.5 animate-spin"/> :
                                            <Undo2 className="size-2.5"/>}
                                        Pop
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 gap-1 text-[9px] px-1.5"
                                        disabled={!!busy}
                                        onClick={(ev) => {
                                            ev.stopPropagation();
                                            applyStash(e);
                                        }}
                                        title="git stash apply — apply this stash to the working tree and KEEP it on the stack"
                                    >
                                        {busy === `Apply ${e.ref}` ? <Loader2 className="size-2.5 animate-spin"/> :
                                            <ArchiveRestore className="size-2.5"/>}
                                        Apply
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 gap-1 text-[9px] px-1.5 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                                        disabled={!!busy}
                                        onClick={(ev) => {
                                            ev.stopPropagation();
                                            setConfirmDrop(e);
                                        }}
                                        title="git stash drop — remove this stash from the stack permanently (asks first)"
                                    >
                                        {busy === `Drop ${e.ref}` ? <Loader2 className="size-2.5 animate-spin"/> :
                                            <Trash2 className="size-2.5"/>}
                                        Drop
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* ── Diff preview ────────────────────────────────── */}
                <div className="min-h-0 rounded-md border flex flex-col overflow-hidden">
                    {selected === null ? (
                        <div className="flex-1 grid place-items-center p-4 text-xs text-muted-foreground">
                            {listCount > 0
                                ? "Select a stash to preview its diff."
                                : "Stash previews appear here."}
                        </div>
                    ) : (
                        <>
                            <div
                                className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-sans">
                <span className="font-mono normal-case tracking-normal">
                  {entries?.find((e) => e.index === selected)?.ref ?? `stash@{${selected}}`}
                </span>
                                <span className="truncate normal-case tracking-normal">
                  {entries?.find((e) => e.index === selected)?.message ?? ""}
                </span>
                            </div>
                            <ScrollArea className="flex-1 min-h-0">
                                {patchLoading ? (
                                    <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                                        <Loader2 className="size-3.5 animate-spin"/>
                                        Loading the stash diff…
                                    </div>
                                ) : patchError ? (
                                    <div className="flex items-start gap-2 p-3 text-xs text-destructive">
                                        <CircleAlert className="size-3.5 shrink-0 mt-0.5"/>
                                        <span>Failed to load the stash diff: {patchError}</span>
                                    </div>
                                ) : patch && patch.trim() ? (
                                    <>
                                        <MultiFileDiffPreview
                                            sections={splitFileDiffSections(patch)}
                                            columns={["Parent state (old)", "Stashed state (new)"]}
                                        />
                                        {patchTruncated && (
                                            <p className="px-3 py-1 text-[10px] text-amber-600 dark:text-amber-400 border-t">
                                                Patch truncated at 256 KB — run git stash show -p in a terminal for the
                                                full diff.
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex items-start gap-2 p-3 text-xs text-muted-foreground">
                                        <CircleAlert className="size-3.5 shrink-0 mt-0.5"/>
                                        <span>No textual diff for this stash (binary-only or empty).</span>
                                    </div>
                                )}
                            </ScrollArea>
                        </>
                    )}
                </div>
            </div>

            {/* Drop confirmation — destructive, so it asks (the diff panel's
       * discard pattern). */}
            <AlertDialog
                open={!!confirmDrop}
                onOpenChange={(v) => {
                    if (!v) setConfirmDrop(null);
                }}
            >
                <AlertDialogContent className="max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Trash2 className="size-4 text-red-500"/>
                            Drop stash?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <code className="font-mono text-[11px]">{confirmDrop?.ref}</code> will be removed
                            from the stash stack permanently. Its changes are only recoverable through the
                            dangling commit <code className="font-mono text-[11px]">{confirmDrop?.shortSha}</code>
                            — apply it first if you still need them.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => {
                                if (confirmDrop) dropStash(confirmDrop);
                                setConfirmDrop(null);
                            }}
                        >
                            Drop stash
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
