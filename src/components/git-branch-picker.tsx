"use client";

import * as React from "react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
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
import {Archive, Check, CloudDownload, CloudUpload, GitBranch, Loader2, Plus, RefreshCw, Trash2} from "lucide-react";
import {toast, useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
// The stash stack dialog — mounted HERE (the footer chip is always
// alive when a repo exists, unlike the diff panel's tab which
// disappears once a push leaves the tree clean) so every stash entry
// point (this popover's button + the diff panel's `Stashes…` menu
// item via the praxis:git-stash-open event) has a live target.
import {GitStashDialog} from "@/components/git-stash-dialog";

interface BranchRow {
    name: string;
    shortSha: string;
}

/** POST /api/git-command with a toast + a status/branch refresh
 *  broadcast (Section 6,— the picker's share of the sync
 *  commands). Mirrors git-diff-panel's runner so both surfaces behave
 *  identically for the same verb. */
function postGitCommand(body: Record<string, unknown>, title: string, onDone: () => void): Promise<void> {
    // The module-level `toast` from use-toast works outside components
    // (the hook's toaster is mounted once by the page).
    return fetch("/api/git-command", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    })
        .then(async (res) => {
            const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; output?: string };
            if (!res.ok || !data.ok) {
                throw new Error(data.error ?? `HTTP ${res.status}`);
            }
            return data;
        })
        .then((data) => {
            toast({
                title,
                description: (data.output ?? "Done.").slice(0, 400) || "Done.",
            });
            onDone();
            window.dispatchEvent(new Event("praxis:git-refresh"));
        })
        .catch((err: Error) => {
            toast({title, description: err.message, variant: "destructive"});
        });
}

/**
 * the footer's git chip, upgraded from a static label to a
 * branch picker. Clicking the chip opens a popover that lists every
 * local branch (checked row = current), switches on click, and creates
 * new branches from an inline input (git switch -c — create + switch
 * in one step, like VS Code's branch creation).
 *
 * After a switch/create the parent is notified via onBranchSwitched so
 * it can re-fetch git status AND the file tree (a different branch can
 * have different files on disk).
 *
 * Per-branch delete: every NON-current row carries a trash affordance
 * (git branch -d behind an AlertDialog — the route refuses the current
 * branch and surfaces the unmerged refusal as a toast).
 *
 * The popover's header opens the stash stack dialog (GitStashDialog),
 * which is mounted HERE — see the import note — and also answers the
 * praxis:git-stash-open event the diff panel's overflow menu fires.
 */
export function GitBranchPicker({
                                    current,
                                    dirtyCount,
                                    onBranchSwitched,
                                }: {
    current: string | null;
    dirtyCount: number;
    onBranchSwitched?: () => void;
}) {
    const {toast} = useToast();
    const [open, setOpen] = React.useState(false);

    // the menubar's Git ▸ Branches… item can pop this same
    // picker open — it listens for `praxis:git-branches-open`.
    React.useEffect(() => {
        const onOpenEvt = () => setOpen(true);
        window.addEventListener("praxis:git-branches-open", onOpenEvt);
        return () => window.removeEventListener("praxis:git-branches-open", onOpenEvt);
    }, []);
    const [branches, setBranches] = React.useState<BranchRow[] | null>(null);
    const [listError, setListError] = React.useState<string | null>(null);
    const [newName, setNewName] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    /** Label of the in-flight sync command (Pull/Push/Fetch) — its
     *  spinner swaps into the matching button. */
    const [syncBusy, setSyncBusy] = React.useState<"Pull" | "Push" | "Fetch" | null>(null);
    /** Branch pending the delete confirmation (AlertDialog) — null =
     *  no confirm open. The CURRENT branch never gets a trash button
     *  (client guard) AND the route refuses it again server-side, so a
     *  stale list can't sneak it past. */
    const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
    /** Stash stack dialog open state — opened from this popover's
     *  Stashes… button or the diff panel's overflow menu
     *  (praxis:git-stash-open event). */
    const [stashOpen, setStashOpen] = React.useState(false);

    // same event channel as praxis:git-branches-open — the diff
    // panel's overflow menu dispatches this to open the stash manager.
    React.useEffect(() => {
        const onOpenStash = () => setStashOpen(true);
        window.addEventListener("praxis:git-stash-open", onOpenStash);
        return () => window.removeEventListener("praxis:git-stash-open", onOpenStash);
    }, []);

    const loadList = React.useCallback(async () => {
        setBranches(null);
        setListError(null);
        try {
            const res = await fetch("/api/git-branch", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "list"}),
            });
            const data = (await res.json()) as
                | { ok: true; branches: BranchRow[]; current: string | null }
                | { ok: false; hint?: string };
            if (data.ok) {
                setBranches(data.branches);
            } else {
                setListError(data.hint ?? "Could not list branches.");
            }
        } catch {
            setListError("Could not list branches.");
        }
    }, []);

    React.useEffect(() => {
        if (open) void loadList();
    }, [open, loadList]);
    // other git surfaces (the diff panel's sync commands, the log
    // dialog's revert) broadcast praxis:git-refresh after every
    // successful mutation — reload the branch list when it fires while
    // the popover is open. (Declared AFTER loadList — the deps array
    // reads it at render time.)
    React.useEffect(() => {
        if (!open) return;
        const onRefresh = () => void loadList();
        window.addEventListener("praxis:git-refresh", onRefresh);
        return () => window.removeEventListener("praxis:git-refresh", onRefresh);
    }, [open, loadList]);

    /* ── Sync commands — the chip's own Pull / Push / Fetch
     * row. Each runs through /api/git-command, toasts git's own output
     * (an unset upstream surfaces git's push hint verbatim), and
     * notifies the parent + every git surface via praxis:git-refresh. */
    const runSync = async (action: "pull" | "push" | "fetch") => {
        if (syncBusy) return;
        const title = action === "pull" ? "Pull" : action === "push" ? "Push" : "Fetch";
        setSyncBusy(title);
        try {
            await postGitCommand({action}, title, () => {
                onBranchSwitched?.();
                void loadList();
            });
        } finally {
            setSyncBusy(null);
        }
    };

    const doAction = React.useCallback(
        async (body: Record<string, unknown>, successTitle: string) => {
            setBusy(true);
            try {
                const res = await fetch("/api/git-branch", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(body),
                });
                const data = (await res.json()) as
                    | { ok: true; message?: string }
                    | { ok: false; error: string };
                if (data.ok) {
                    toast({title: successTitle, description: data.message});
                    setOpen(false);
                    setNewName("");
                    onBranchSwitched?.();
                    void loadList();
                } else {
                    toast({
                        title: "Branch",
                        description: data.error,
                        variant: "destructive",
                    });
                }
            } catch {
                toast({title: "Branch", description: "Network error.", variant: "destructive"});
            } finally {
                setBusy(false);
            }
        },
        [toast, onBranchSwitched, loadList]
    );

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className="hidden lg:inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded bg-muted/50 hover:bg-muted transition-colors"
                        title={
                            current
                                ? `Branch: ${current} — click to switch or create a branch`
                                : "Branch management"
                        }
                        aria-label={`Git branch: ${current ?? "none"} — open branch picker`}
                        aria-haspopup="dialog"
                    >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                            <path
                                d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 .984V8.5a2.5 2.5 0 01-2.5 2.5H6.25a2.5 2.5 0 00-2.5 2.5v.516a2.25 2.25 0 11-1.5 0V5.484a2.25 2.25 0 111.5 0v3.516A2.5 2.5 0 016.25 9.5h2.5a2.5 2.5 0 002.5-2.5V4.234A2.25 2.25 0 019.5 3.25zM4.25 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm0 9a.75.75 0 100 1.5.75.75 0 000-1.5z"/>
                        </svg>
                        <span className="truncate max-w-[120px]">{current}</span>
                        {dirtyCount > 0 && (
                            <span className="text-amber-500 font-medium" title={`${dirtyCount} modified`}>
              ●{dirtyCount}
            </span>
                        )}
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-0" aria-label="Branch picker">
                    <div className="px-2 py-1.5 border-b flex items-center gap-1.5">
                        <GitBranch className="size-3.5 text-muted-foreground"/>
                        <span className="text-xs font-medium flex-1">Branches</span>
                        {/* Stashes… — opens the stash stack dialog (push / pop / apply /
              drop + per-stash diff preview). Sits in the header so it
              stays reachable without scrolling the branch list. */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-5"
                            aria-label="Open the stash manager"
                            title="Stashes — push the current changes, pop / apply / drop entries, and preview each stash's diff"
                            onClick={() => setStashOpen(true)}
                        >
                            <Archive className="size-3"/>
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-5"
                            aria-label="Refresh branch list"
                            title="Refresh"
                            onClick={() => void loadList()}
                        >
                            <RefreshCw className="size-3"/>
                        </Button>
                    </div>

                    {/* ── Sync row (Section 6,— Pull / Push / Fetch from
            the branch popover itself. */}
                    <div className="px-1.5 py-1.5 border-b grid grid-cols-3 gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 text-[10px] px-1"
                            disabled={syncBusy !== null}
                            onClick={() => void runSync("pull")}
                            title="git pull — fetch + merge the current branch's upstream"
                        >
                            {syncBusy === "Pull" ? <Loader2 className="size-3 animate-spin"/> :
                                <CloudDownload className="size-3"/>}
                            Pull
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 text-[10px] px-1"
                            disabled={syncBusy !== null}
                            onClick={() => void runSync("push")}
                            title="git push — upload the current branch to its upstream"
                        >
                            {syncBusy === "Push" ? <Loader2 className="size-3 animate-spin"/> :
                                <CloudUpload className="size-3"/>}
                            Push
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 text-[10px] px-1"
                            disabled={syncBusy !== null}
                            onClick={() => void runSync("fetch")}
                            title="git fetch --all --prune — update remote-tracking branches only"
                        >
                            {syncBusy === "Fetch" ? <Loader2 className="size-3 animate-spin"/> :
                                <CloudDownload className="size-3"/>}
                            Fetch
                        </Button>
                    </div>

                    <div className="max-h-52 overflow-y-auto py-1">
                        {listError ? (
                            <p className="px-2 py-2 text-[11px] text-muted-foreground">{listError}</p>
                        ) : branches === null ? (
                            <p className="px-2 py-2 text-[11px] text-muted-foreground">Loading branches…</p>
                        ) : branches.length === 0 ? (
                            <p className="px-2 py-2 text-[11px] text-muted-foreground">No branches yet.</p>
                        ) : (
                            branches.map((b) => (
                                // One row = a flex container holding TWO buttons: the
                                // switch button (full-width label row) and, for
                                // non-current branches, the delete affordance. They
                                // can't nest (invalid HTML: button inside button) and
                                // the trash must not trigger a switch — a plain div
                                // row keeps both clickable regions separate.
                                <div key={b.name} className="flex items-center gap-0.5 px-1">
                                    <button
                                        type="button"
                                        disabled={busy || b.name === current}
                                        onClick={() => void doAction({
                                            action: "switch",
                                            name: b.name
                                        }, "Branch switched")}
                                        className={cn(
                                            "flex-1 min-w-0 text-left px-1.5 py-1 flex items-center gap-2 text-xs rounded-sm hover:bg-accent/60 disabled:opacity-60",
                                            b.name === current && "text-emerald-600 dark:text-emerald-400"
                                        )}
                                        title={
                                            b.name === current
                                                ? "Current branch"
                                                : `Switch to ${b.name} (git switch)`
                                        }
                                    >
                  <span className="w-3.5 shrink-0 flex justify-center">
                    {b.name === current && <Check className="size-3"/>}
                  </span>
                                        <span className="truncate flex-1 font-mono">{b.name}</span>
                                        <span className="text-[9px] text-muted-foreground font-mono shrink-0">
                    {b.shortSha}
                  </span>
                                    </button>
                                    {b.name !== current && (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => setPendingDelete(b.name)}
                                            className="size-5 shrink-0 grid place-items-center rounded text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                                            aria-label={`Delete branch ${b.name}`}
                                            title={`Delete ${b.name} (git branch -d — asks first; refuses if unmerged)`}
                                        >
                                            <Trash2 className="size-3"/>
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-2 border-t flex items-center gap-1.5">
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && newName.trim() && !busy) {
                                    void doAction(
                                        {action: "create", name: newName.trim()},
                                        "Branch created"
                                    );
                                }
                            }}
                            placeholder="new-branch-name"
                            className="h-7 text-xs font-mono"
                            aria-label="New branch name"
                            disabled={busy}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 gap-1 shrink-0"
                            disabled={busy || !newName.trim()}
                            onClick={() => void doAction({action: "create", name: newName.trim()}, "Branch created")}
                            title="Create this branch and switch to it (git switch -c)"
                        >
                            <Plus className="size-3"/>
                            Create
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>

            {/* Delete confirmation — mirrors the diff panel's discard
       * pattern (AlertDialog + destructive action). The route guards
       * the current branch and surfaces `git branch -d`'s unmerged
       * refusal as the toast description; doAction handles the busy
       * state + the branch-list reload + the praxis:git-refresh
       * broadcast for the log dialog's graph badges. */}
            <AlertDialog
                open={!!pendingDelete}
                onOpenChange={(v) => {
                    if (!v) setPendingDelete(null);
                }}
            >
                <AlertDialogContent className="max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Trash2 className="size-4 text-red-500"/>
                            Delete branch?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <code className="font-mono text-[11px]">{pendingDelete}</code> will be deleted
                            with git branch -d. Git refuses if the branch has commits no other branch
                            contains, so nothing merged elsewhere is lost silently.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => {
                                if (pendingDelete) {
                                    void doAction(
                                        {action: "delete", name: pendingDelete},
                                        "Branch deleted"
                                    );
                                }
                                setPendingDelete(null);
                            }}
                        >
                            Delete branch
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* The stash stack dialog — see the import note for why it mounts
       * here (the footer chip outlives the diff panel's tab). */}
            <GitStashDialog
                open={stashOpen}
                onOpenChange={setStashOpen}
                onWorktreeChanged={onBranchSwitched}
            />
        </>
    );
}
