"use client";

import * as React from "react";
import {
    Archive,
    CircleAlert,
    CloudDownload,
    CloudUpload,
    ExternalLink,
    FileCode2,
    FolderDown,
    GitCompare,
    GitMerge,
    Loader2,
    Minus,
    MoreVertical,
    Plus,
    RefreshCw,
    Trash2,
    Undo2,
    User,
    X,
} from "lucide-react";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select";
import {Button} from "@/components/ui/button";
import {ScrollArea} from "@/components/ui/scroll-area";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
// Inline-blame the porcelain parser + run grouping live in
// the tested lib module; the route returns parsed BlameLine[].
import {type BlameLine, blameRelTime, groupBlameRuns} from "@/lib/git-blame";

/* ================================================================== */
/*  Types — git-status entry (mirrors /api/git-status)                 */

/* ================================================================== */

interface GitEntry {
    path: string;
    indexStatus: string;
    wtStatus: string;
}

/* ================================================================== */
/*  Unified-diff parser → side-by-side rows                            */
/* ================================================================== */

type RowType = "context" | "added" | "removed" | "modified";

interface DiffRow {
    /** 1-indexed OLD-file line number, or null when this row has no old-side line. */
    oldNumber: number | null;
    /** 1-indexed NEW-file line number, or null when this row has no new-side line. */
    newNumber: number | null;
    /** OLD-side text (null = empty gutter cell on the left). */
    oldText: string | null;
    /** NEW-side text (null = empty gutter cell on the right). */
    newText: string | null;
    type: RowType;
    /** Section 6— which hunk (`@@` block, 0-based) the row
     *  belongs to; drives the per-hunk “Stage hunk” buttons. */
    hunkIndex: number;
}

/** Which pair of trees the diff grid compares — the segmented
 *  control in the diff header flips it, and it decides which
 *  direction the per-file / per-hunk action buttons push (stage
 *  INTO the index vs unstage OUT OF it). */
type DiffScope = "all" | "unstaged" | "staged";

/** Scope metadata — segmented-control labels, the two column
 *  headers, and their tooltips. */
const SCOPE_ORDER: DiffScope[] = ["all", "unstaged", "staged"];
const SCOPE_META: Record<
    DiffScope,
    { label: string; left: string; right: string; hint: string }
> = {
    all: {
        label: "All",
        left: "HEAD (old)",
        right: "Working tree (new)",
        hint: "git diff HEAD — the classic combined view: staged + unstaged changes side by side",
    },
    unstaged: {
        label: "Unstaged",
        left: "Index (old)",
        right: "Working tree (new)",
        hint: "git diff — working-tree changes not in the index yet (the Stage buttons move these into the index)",
    },
    staged: {
        label: "Staged",
        left: "HEAD (old)",
        right: "Index (new)",
        hint: "git diff --cached — the staged changes the Unstage buttons remove from the index (and what a plain git commit would record)",
    },
};

/**
 * Parse a unified diff into a list of side-by-side rows. Each row is
 * either:
 *   - context: same line on both sides (gray)
 *   - removed: only on the old side (red bg)
 *   - added: only on the new side (green bg)
 *   - modified: paired `-`/`+` lines (red bg left, green bg right)
 *
 * Hunk headers (`@@ -a,b +c,d @@`) reset the line counters; adjacent
 * `-` and `+` runs are paired up min(|rem|,|add|) times and the
 * leftovers become removed / added rows.
 */
function parseUnifiedDiff(diff: string): DiffRow[] {
    const rows: DiffRow[] = [];
    const lines = diff.split("\n");
    let oldLine = 0;
    let newLine = 0;
    // Current hunk index (0-based) — bumped at every @@ header so
    // each row knows which “Stage hunk” button owns it.
    let hunkIndex = -1;

    // Pending adjacent - / + runs — flushed (paired up) on the next
    // context line or hunk header. Pairing produces "modified" rows;
    // leftovers become "removed" / "added" rows.
    let pendingRemovals: { num: number; text: string }[] = [];
    let pendingAdditions: { num: number; text: string }[] = [];

    const flush = () => {
        const pairCount = Math.min(
            pendingRemovals.length,
            pendingAdditions.length
        );
        for (let i = 0; i < pairCount; i++) {
            rows.push({
                oldNumber: pendingRemovals[i].num,
                newNumber: pendingAdditions[i].num,
                oldText: pendingRemovals[i].text,
                newText: pendingAdditions[i].text,
                type: "modified",
                hunkIndex,
            });
        }
        for (let i = pairCount; i < pendingRemovals.length; i++) {
            rows.push({
                oldNumber: pendingRemovals[i].num,
                newNumber: null,
                oldText: pendingRemovals[i].text,
                newText: null,
                type: "removed",
                hunkIndex,
            });
        }
        for (let i = pairCount; i < pendingAdditions.length; i++) {
            rows.push({
                oldNumber: null,
                newNumber: pendingAdditions[i].num,
                oldText: null,
                newText: pendingAdditions[i].text,
                type: "added",
                hunkIndex,
            });
        }
        pendingRemovals = [];
        pendingAdditions = [];
    };

    for (const line of lines) {
        // Hunk header → reset counters, flush pending runs, next hunk.
        const hunkMatch = line.match(
            /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
        );
        if (hunkMatch) {
            flush();
            hunkIndex += 1;
            oldLine = parseInt(hunkMatch[1], 10);
            newLine = parseInt(hunkMatch[3], 10);
            continue;
        }

        // Skip file-level preamble lines (diff --git, index, ---, +++,
        // mode / rename / copy / new-file / binary markers).
        if (
            line.startsWith("--- ") ||
            line.startsWith("+++ ") ||
            line.startsWith("diff --git") ||
            line.startsWith("index ") ||
            line.startsWith("old mode ") ||
            line.startsWith("new mode ") ||
            line.startsWith("similarity index ") ||
            line.startsWith("dissimilarity index ") ||
            line.startsWith("rename from ") ||
            line.startsWith("rename to ") ||
            line.startsWith("copy from ") ||
            line.startsWith("copy to ") ||
            line.startsWith("deleted file ") ||
            line.startsWith("new file ") ||
            line.startsWith("Binary files ") ||
            line.startsWith("git binary patch")
        ) {
            continue;
        }

        if (line.startsWith("-")) {
            pendingRemovals.push({num: oldLine++, text: line.slice(1)});
        } else if (line.startsWith("+")) {
            pendingAdditions.push({num: newLine++, text: line.slice(1)});
        } else if (line.startsWith("\\")) {
            // "\ No newline at end of file" — skip, no counter advance.
            continue;
        } else {
            // Context line — leading " " (or empty). Flush + push a context row.
            flush();
            const text = line.startsWith(" ") ? line.slice(1) : line;
            rows.push({
                oldNumber: oldLine++,
                newNumber: newLine++,
                oldText: text,
                newText: text,
                type: "context",
                hunkIndex,
            });
        }
    }
    flush();
    return rows;
}

/* ================================================================== */
/* Hunk slicing — per-hunk “Stage hunk” via git apply) */

/* ================================================================== */

/** Slice a raw unified diff into one APPLIABLE patch per `@@` hunk:
 *  the file preamble (diff --git / --- / +++) + exactly that hunk's
 *  body. `git apply --cached -` accepts each slice as-is (the route
 *  runs it from the repo root so a/ b/ resolve). Trailing blank
 *  lines are trimmed — the split("\n") artifact would otherwise ride
 *  along as a phantom empty context line. */
function splitHunkPatches(diff: string): string[] {
    const lines = diff.split("\n");
    const first = lines.findIndex((l) => l.startsWith("@@"));
    if (first === -1) return [];
    const preamble = lines.slice(0, first);
    const patches: string[] = [];
    let i = first;
    while (i < lines.length) {
        if (!lines[i].startsWith("@@")) {
            i++;
            continue;
        }
        let j = i + 1;
        while (j < lines.length && !lines[j].startsWith("@@")) j++;
        let end = j;
        while (end > i + 1 && lines[end - 1].trim() === "") end--;
        patches.push([...preamble, ...lines.slice(i, end)].join("\n") + "\n");
        i = j;
    }
    return patches;
}

/* ================================================================== */
/*  Multi-file diff splitting (shared review machinery)               */

/* ================================================================== */

/** One file's slice of a multi-file raw diff — the display path is
 *  supplied by the CALLER (or derived from the section's own headers
 *  by splitFileDiffSections), never re-derived inside the renderer:
 *  the --no-index untracked diffs carry mangled absolute paths that
 *  must not leak into review UIs. */
export interface DiffFileSection {
    path: string;
    diff: string;
}

/** Derive the display path for one file section of a raw diff: the
 *  `+++ b/<path>` line wins (rename destinations land there); fall
 *  back to the right side of the `diff --git a/x b/y` header. */
function sectionPath(lines: string[]): string {
    for (const l of lines) {
        if (l.startsWith("+++ b/")) return l.slice(6).trim();
    }
    const header = lines.find((l) => l.startsWith("diff --git "));
    const m = header ? header.match(/^diff --git a\/(.*) b\/(.*)$/) : null;
    return m?.[2] ?? "file";
}

/** Split ONE raw multi-file unified diff (e.g. `git stash show -p`
 *  output) into per-file sections at its `diff --git` headers. Each
 *  section keeps its own preamble so parseUnifiedDiff (and any
 *  future git-apply hunk slicing) stays valid within the section.
 *  Empty input → []. */
export function splitFileDiffSections(diff: string): DiffFileSection[] {
    if (!diff.trim()) return [];
    const lines = diff.split("\n");
    const sections: DiffFileSection[] = [];
    let start = 0;
    for (let i = 1; i < lines.length; i++) {
        if (/^diff --git /.test(lines[i])) {
            sections.push({
                path: sectionPath(lines.slice(start, i)),
                diff: lines.slice(start, i).join("\n"),
            });
            start = i;
        }
    }
    sections.push({
        path: sectionPath(lines.slice(start)),
        diff: lines.slice(start).join("\n"),
    });
    return sections;
}

/* ================================================================== */
/*  Status → short label + color                                       */

/* ================================================================== */

function statusLabel(entry: GitEntry): string {
    // Prefer the working-tree status; fall back to index status.
    const s = entry.wtStatus !== " " ? entry.wtStatus : entry.indexStatus;
    switch (s) {
        case "M":
            return "Modified";
        case "A":
            return "Added";
        case "D":
            return "Deleted";
        case "R":
            return "Renamed";
        case "C":
            return "Copied";
        case "?":
            return "Untracked";
        case "U":
            return "Unmerged";
        default:
            return s || "Modified";
    }
}

function statusBadgeClass(entry: GitEntry): string {
    const s = entry.wtStatus !== " " ? entry.wtStatus : entry.indexStatus;
    switch (s) {
        case "M":
            return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
        case "A":
            return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
        case "D":
            return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
        case "?":
            return "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30";
        default:
            return "bg-muted text-muted-foreground border-border";
    }
}

/* ================================================================== */
/*  GitDiffPanel                                                       */

/* ================================================================== */

interface GitDiffPanelProps {
    /** The modified-file list, owned by the parent (page.tsx) — the
     *  panel used to fire its own /api/git-status request on every
     *  mount and nonce bump, a fully redundant third caller per page
     *  load and a second caller after every commit . */
    entries: GitEntry[];
    /** True while the parent is fetching a fresh status list. */
    loading?: boolean;
    /** Re-fetch the status list (wired to the page's fetchGitStatus). */
    onRefresh: () => void;
    /**
     * Called when the panel finishes a successful commit refresh cycle
     * (the parent re-fetches git-status so the file list stays in sync).
     */
    onCommitted?: () => void;
}

/**
 * Git Diff panel — shown as a tab in the bottom panel (alongside
 * Output / Diagnostics / Notes). Lists every modified file in a
 * dropdown and renders a side-by-side diff (old vs new) for the
 * selected file, with red/green/gray row coloring.
 *
 * The file list arrives as a prop from the page (which owns the
 * single /api/git-status fetch); the per-file diff text comes from
 * /api/git-diff-content (raw unified diff). The parsing into
 * side-by-side rows happens client-side (see parseUnifiedDiff).
 *
 * Section 6 additions:
 *   ▸ ACTIVE-FILE FOCUS (1a) — the panel listens for the
 *     `praxis:git-diff-active` window event ({ folderSlug, fileSlug }
 *     or a ready { path }) AND the explorer's existing
 *     `praxis:open-git-diff` ({ folder, file }) dispatch: the focused
 *     file's repo-relative path is resolved via
 *     POST /api/git-command { action: "resolveActive" } and diffed
 *     even when it is NOT in the modified list (a clean file shows
 *     "no changes", an untracked one shows the all-added diff). A
 *     chip next to the selector shows + clears the focus.
 *   ▸ SYNC COMMANDS (1b) — Pull / Push / Fetch buttons + an overflow
 *     menu (stash push/pop/list/drop, merge…, rebase…, clone…, revert
 *     HEAD, abort) through POST /api/git-command; every success
 *     re-fetches git-status AND broadcasts `praxis:git-refresh` so
 *     the branch picker / log dialog can reload too.
 *   ▸ STAGE / DISCARD / STAGE HUNK (1c) — inside the diff header and
 *     at each hunk boundary.
 *   ▸ BLAME MODE (1d) — a per-file toggle rendering the inline blame
 *     gutter (short sha · author · relative date per line-run).
 *   ▸ UNSTAGE + SCOPES — a segmented control (All / Unstaged /
 *     Staged) picks the pair of trees the grid compares; the staged
 *     view swaps the action family to Unstage file / Unstage hunk
 *     (git restore --staged / git apply -R --cached). A fully staged
 *     file auto-opens in the staged view. The multi-file preview
 *     renderer (MultiFileDiffPreview + splitFileDiffSections) is
 *     exported for the commit dialog's review area and the stash
 *     dialog's diff view.
 *   ▸ STASHES… — the overflow menu opens the stash stack dialog via
 *     the praxis:git-stash-open event (the dialog itself is mounted
 *     by the footer's branch picker, which outlives this tab).
 */
export function GitDiffPanel({entries, loading = false, onRefresh, onCommitted}: GitDiffPanelProps) {
    const {toast} = useToast();
    const [selectedPath, setSelectedPath] = React.useState<string>("");
    /** The focused "active file" path (repo-root-relative) — null = list mode. */
    const [focusPath, setFocusPath] = React.useState<string | null>(null);
    /** Label of the in-flight sync command (disables the row while set). */
    const [busyAction, setBusyAction] = React.useState<string | null>(null);

    // Auto-select the first entry when the list arrives and nothing is
    // selected yet (or when the previously-selected path disappeared).
    React.useEffect(() => {
        if (entries.length === 0) {
            setSelectedPath("");
            return;
        }
        if (!selectedPath || !entries.some((e) => e.path === selectedPath)) {
            setSelectedPath(entries[0].path);
        }
    }, [entries, selectedPath]);

    /* ── Active-file focus ─────────────────────────────────
     * Two events resolve to a focused path: the panel's own
     * `praxis:git-diff-active` ({ folderSlug, fileSlug } | { path }) and
     * the explorer's `praxis:open-git-diff` ({ folder, file }) — the
     * latter is ALREADY dispatched by the file context menu today, so
     * the focus mode works without any page.tsx wiring. */
    React.useEffect(() => {
        const resolveAndFocus = async (folderSlug: string, fileSlug: string) => {
            try {
                const res = await fetch("/api/git-command", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({action: "resolveActive", folder: folderSlug, file: fileSlug}),
                });
                const data = (await res.json()) as { ok?: boolean; relPath?: string; error?: string };
                if (data.ok && typeof data.relPath === "string" && data.relPath) {
                    setFocusPath(data.relPath);
                }
            } catch {
                /* offline — focus stays unset, list mode keeps working */
            }
        };
        const onActive = (e: Event) => {
            const d = (e as CustomEvent).detail as
                | { folderSlug?: string; fileSlug?: string; folder?: string; file?: string; path?: string }
                | undefined;
            if (!d) return;
            if (typeof d.path === "string" && d.path) {
                setFocusPath(d.path);
                return;
            }
            const folder = d.folderSlug ?? d.folder;
            const file = d.fileSlug ?? d.file;
            if (folder && file) void resolveAndFocus(folder, file);
        };
        window.addEventListener("praxis:git-diff-active", onActive);
        window.addEventListener("praxis:open-git-diff", onActive);
        return () => {
            window.removeEventListener("praxis:git-diff-active", onActive);
            window.removeEventListener("praxis:open-git-diff", onActive);
        };
    }, []);

    /* ── Sync-command runner ───────────────────────────────
     * POSTs /api/git-command, toasts the result, re-fetches the status
     * list AND broadcasts praxis:git-refresh (the branch picker + log
     * dialog listen for it). */
    const runCommand = React.useCallback(
        async (body: Record<string, unknown>, title: string) => {
            if (busyAction) return;
            setBusyAction(title);
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
                    message?: string;
                    stashes?: string[];
                    dir?: string;
                };
                if (!res.ok || !data.ok) {
                    toast({
                        title,
                        description: data.error ?? `HTTP ${res.status}`,
                        variant: "destructive",
                    });
                    return;
                }
                // stashList answers with the list itself — show it verbatim.
                const description =
                    Array.isArray(data.stashes) && data.stashes.length > 0
                        ? data.stashes.slice(0, 5).join("\n")
                        : Array.isArray(data.stashes)
                            ? "No stashes."
                            : (data.output || data.message || "Done.").slice(0, 600) || "Done.";
                toast({title, description, variant: "success"});
                onRefresh();
                window.dispatchEvent(new Event("praxis:git-refresh"));
            } catch (err) {
                toast({title, description: (err as Error).message, variant: "destructive"});
            } finally {
                setBusyAction(null);
            }
        },
        [busyAction, onRefresh, toast]
    );

    /** prompt + run for the branch-taking commands (merge/rebase). */
    const promptBranch = (title: string, action: "merge" | "rebase") => {
        const branch = window.prompt(title, "");
        if (!branch || !branch.trim()) return;
        void runCommand({action, branch: branch.trim()}, action === "merge" ? "Merge" : "Rebase");
    };

    const busy = !!busyAction;

    return (
        <div className="flex flex-col h-full min-h-0 gap-2">
            {/* Toolbar — file selector + focus chip + refresh + sync commands */}
            <div className="flex flex-wrap items-center gap-2 px-1 shrink-0">
                <GitCompare className="size-4 text-muted-foreground shrink-0"/>
                <Select value={selectedPath} onValueChange={setSelectedPath}>
                    <SelectTrigger className="h-8 text-xs font-mono flex-1 min-w-0">
                        <SelectValue placeholder={loading ? "Loading…" : "Select a modified file"}/>
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                        {entries.length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                No modified files.
                            </div>
                        ) : (
                            entries.map((e) => (
                                <SelectItem key={e.path} value={e.path} className="text-xs font-mono gap-2">
                                    <span className="truncate flex-1">{e.path}</span>
                                    <span
                                        className={cn(
                                            "ml-auto px-1.5 py-0.5 rounded border text-[10px] font-sans shrink-0",
                                            statusBadgeClass(e)
                                        )}
                                    >
                    {statusLabel(e)}
                  </span>
                                </SelectItem>
                            ))
                        )}
                    </SelectContent>
                </Select>

                {/* Focus chip — the active-file mode indicator + clear button. */}
                {focusPath && (
                    <span
                        className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-primary/30 bg-primary/5 text-[10px] font-mono max-w-48 shrink-0"
                        title={`Focused on the active file: ${focusPath} (click × to return to the modified-file list)`}
                    >
            <span className="truncate">{focusPath}</span>
            <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => setFocusPath(null)}
                aria-label="Clear the active-file focus"
                title="Clear the active-file focus"
            >
              <X className="size-3"/>
            </button>
          </span>
                )}

                <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={onRefresh}
                    disabled={loading}
                    aria-label="Refresh git status"
                    title="Refresh the modified-file list"
                >
                    <RefreshCw className={cn("size-3.5", loading && "animate-spin")}/>
                </Button>

                {/* ── Sync commands — Pull / Push / Fetch + overflow */}
                <div className="h-5 w-px bg-border shrink-0" aria-hidden/>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[11px] px-2 shrink-0"
                    onClick={() => void runCommand({action: "pull"}, "Pull")}
                    disabled={busy}
                    title="git pull — fetch and merge the current branch's upstream"
                >
                    {busyAction === "Pull" ? <Loader2 className="size-3 animate-spin"/> :
                        <CloudDownload className="size-3.5"/>}
                    Pull
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[11px] px-2 shrink-0"
                    onClick={() => void runCommand({action: "push"}, "Push")}
                    disabled={busy}
                    title="git push — upload the current branch to its upstream"
                >
                    {busyAction === "Push" ? <Loader2 className="size-3 animate-spin"/> :
                        <CloudUpload className="size-3.5"/>}
                    Push
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[11px] px-2 shrink-0"
                    onClick={() => void runCommand({action: "fetch"}, "Fetch")}
                    disabled={busy}
                    title="git fetch --all --prune — update every remote-tracking branch without touching the working tree"
                >
                    {busyAction === "Fetch" ? <Loader2 className="size-3 animate-spin"/> :
                        <CloudDownload className="size-3.5"/>}
                    Fetch
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-[11px] px-2 shrink-0"
                            disabled={busy}
                            aria-label="More git commands"
                            title="Stash, merge, rebase, clone, revert — the rest of the git toolbar"
                        >
                            <MoreVertical className="size-3.5"/>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                            className="gap-2 text-xs"
                            onClick={() => {
                                const msg = window.prompt("Stash message (optional — empty is fine):", "") ?? "";
                                void runCommand({action: "stashPush", message: msg}, "Stash push");
                            }}
                        >
                            <Archive className="size-3.5"/> Stash push…
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 text-xs"
                            onClick={() => void runCommand({action: "stashPop"}, "Stash pop")}
                        >
                            <Undo2 className="size-3.5"/> Stash pop (latest)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 text-xs"
                            onClick={() =>
                                // Opens the real stash stack dialog (mounted by the
                                // footer's branch picker — it outlives this panel's
                                // tab, which disappears once a push leaves the tree
                                // clean). Quick push/pop stay here as one-click
                                // actions; this item opens the full manager.
                                window.dispatchEvent(new Event("praxis:git-stash-open"))
                            }
                        >
                            <Archive className="size-3.5"/> Stashes…
                        </DropdownMenuItem>
                        <DropdownMenuSeparator/>
                        <DropdownMenuItem
                            className="gap-2 text-xs"
                            onClick={() => promptBranch("Merge which branch into the current one?", "merge")}
                        >
                            <GitMerge className="size-3.5"/> Merge…
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 text-xs"
                            onClick={() => promptBranch("Rebase the current branch onto which branch?", "rebase")}
                        >
                            <GitMerge className="size-3.5"/> Rebase…
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 text-xs"
                            onClick={() => void runCommand({action: "abort"}, "Abort")}
                        >
                            <CircleAlert className="size-3.5"/> Abort merge / rebase
                        </DropdownMenuItem>
                        <DropdownMenuSeparator/>
                        <DropdownMenuItem
                            className="gap-2 text-xs"
                            onClick={() => {
                                const url = window.prompt("Clone a repository — URL:", "");
                                if (!url || !url.trim()) return;
                                const dir = window.prompt("Folder name to clone into (inside your scripts root):", "");
                                if (!dir || !dir.trim()) return;
                                void runCommand({action: "clone", url: url.trim(), dir: dir.trim()}, "Clone");
                            }}
                        >
                            <FolderDown className="size-3.5"/> Clone…
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 text-xs"
                            onClick={() => void runCommand({action: "revert", sha: "HEAD"}, "Revert")}
                        >
                            <Undo2 className="size-3.5"/> Revert last commit
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Body — diff view or status messages */}
            <div className="flex-1 min-h-0 rounded-md border overflow-hidden bg-background">
                {loading ? (
                    <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                        <Loader2 className="size-4 animate-spin"/>
                        Loading git status…
                    </div>
                ) : focusPath ? (
                    /* Focus mode (1a): diff the focused path even when it is not
                     * in the modified list — a synthetic entry lets DiffView keep
                     * its untracked detection; the focus chip above clears it. */
                    <DiffView
                        key={focusPath}
                        path={focusPath}
                        entries={entries}
                        onMutated={onRefresh}
                    />
                ) : entries.length === 0 ? (
                    // left-aligned (was items-center justify-center
                    // + h-full, which floated the message to the vertical middle
                    // too) — matches the Output panel's empty state per the
                    // user's "left, not in the center" request.
                    <div className="flex flex-col items-start gap-2 p-6 text-xs text-muted-foreground">
                        <FileCode2 className="size-8 opacity-40"/>
                        <span>No uncommitted changes — working tree is clean.</span>
                        {onCommitted && (
                            <span className="text-[10px] opacity-70">
                Edits to your scripts will appear here.
              </span>
                        )}
                    </div>
                ) : !selectedPath ? (
                    <div className="p-4 text-xs text-muted-foreground">
                        Select a file above to view its diff.
                    </div>
                ) : (
                    <DiffView path={selectedPath} entries={entries} onMutated={onRefresh}/>
                )}
            </div>
        </div>
    );
}

/* ================================================================== */
/*  DiffView — fetches + renders one file's side-by-side diff          */

/* ================================================================== */

function DiffView({
                      path,
                      entries,
                      onMutated,
                  }: {
    path: string;
    entries: GitEntry[];
    /** Called after stage/discard mutations so the parent re-fetches status. */
    onMutated?: () => void;
}) {
    const {toast} = useToast();
    const [diff, setDiff] = React.useState<string>("");
    const [isRepo, setIsRepo] = React.useState(true);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [binary, setBinary] = React.useState(false);
    /** Bumped after every stage/discard mutation → re-fetch this diff. */
    const [nonce, setNonce] = React.useState(0);
    /** Inline-blame state. */
    const [blameOn, setBlameOn] = React.useState(false);
    const [blameLines, setBlameLines] = React.useState<BlameLine[] | null>(null);
    const [blameLoading, setBlameLoading] = React.useState(false);
    const [blameError, setBlameError] = React.useState<string | null>(null);
    /** Confirmation for the destructive per-file discard. */
    const [confirmDiscard, setConfirmDiscard] = React.useState(false);
    /** Label of the in-flight file mutation (Stage / Discard / hunk #). */
    const [mutating, setMutating] = React.useState<string | null>(null);
    /** Which pair of trees this view compares — flipped by the
     *  segmented control in the diff header; the Stage ⇄ Unstage
     *  button family follows it (see SCOPE_META). */
    const [scope, setScope] = React.useState<DiffScope>("all");

    const entry = entries.find((e) => e.path === path);
    const isUntracked = entry?.wtStatus === "?" || entry?.indexStatus === "?";

    // Latest entries WITHOUT re-triggering the effect below: the scope
    // auto-pick must run on PATH change only, never on every status
    // refresh — a refresh fires after every stage/unstage mutation,
    // and resetting the user's manual scope choice right after they
    // picked it would fight them.
    const entriesRef = React.useRef(entries);
    entriesRef.current = entries;
    // Pick the most informative opening scope per file: a FULLY staged
    // file (index dirty, worktree clean) opens straight into the
    // staged view — that's where its changes and the Unstage buttons
    // live; anything else opens in the classic combined HEAD view.
    React.useEffect(() => {
        const e = entriesRef.current.find((x) => x.path === path);
        setScope(
            e && e.wtStatus === " " && e.indexStatus !== " " && e.indexStatus !== "?"
                ? "staged"
                : "all"
        );
    }, [path]);

    // Fetch the diff whenever the selected path changes, the scope
    // flips, or a mutation bumped the nonce. Untracked files pass
    // `untracked=1`
    // — the route then diffs /dev/null against the file so the WHOLE
    // content renders as an all-added diff every file state
    // has a view, not a dead-end message).
    React.useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        setDiff("");
        setBinary(false);
        const qs = new URLSearchParams({path});
        // The /dev/null untracked fallback describes the WORKING TREE —
        // skip it in the staged scope (an untracked file has no index
        // entry; the cached diff there is legitimately empty).
        if (isUntracked && scope !== "staged") qs.set("untracked", "1");
        if (scope !== "all") qs.set("scope", scope);
        fetch(`/api/git-diff-content?${qs.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
        })
            .then(async (res) => {
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || `HTTP ${res.status}`);
                }
                return res.json() as Promise<{
                    ok: boolean;
                    isRepo?: boolean;
                    diff?: string;
                    binary?: boolean;
                }>;
            })
            .then((data) => {
                setIsRepo(data.isRepo !== false);
                setDiff(data.diff ?? "");
                setBinary(data.binary === true);
            })
            .catch((err: Error) => {
                if (err.name === "AbortError") return;
                setError(err.message);
            })
            .finally(() => {
                setLoading(false);
            });
        return () => controller.abort();
    }, [path, nonce, isUntracked, scope]);

    // Fetch blame when the toggle turns on — blame describes
    // the WORKING-TREE file, so it is orthogonal to the diff contents.
    React.useEffect(() => {
        if (!blameOn) {
            setBlameLines(null);
            setBlameError(null);
            return;
        }
        let cancelled = false;
        setBlameLoading(true);
        setBlameError(null);
        (async () => {
            try {
                const res = await fetch("/api/git-command", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({action: "blame", path}),
                });
                const data = (await res.json()) as {
                    ok?: boolean;
                    lines?: BlameLine[];
                    error?: string;
                    isRepo?: boolean;
                };
                if (cancelled) return;
                if (!res.ok || !data.ok) {
                    setBlameError(data.error ?? `HTTP ${res.status}`);
                    return;
                }
                setBlameLines(Array.isArray(data.lines) ? data.lines : []);
            } catch (err) {
                if (!cancelled) setBlameError((err as Error).message);
            } finally {
                if (!cancelled) setBlameLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [blameOn, path]);

    /* ── Mutation helpers — stage / discard / stage hunk. All
     * through /api/git-command; a successful mutation bumps the nonce
     * (this diff re-fetches) and notifies the parent (status refresh). */
    const runMutation = React.useCallback(
        async (body: Record<string, unknown>, title: string) => {
            if (mutating) return;
            setMutating(title);
            try {
                const res = await fetch("/api/git-command", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(body),
                });
                const data = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string;
                };
                if (!res.ok || !data.ok) {
                    toast({title, description: data.error ?? `HTTP ${res.status}`, variant: "destructive"});
                    return;
                }
                toast({title, description: "The file list re-syncs.", variant: "success"});
                setNonce((n) => n + 1);
                onMutated?.();
                window.dispatchEvent(new Event("praxis:git-refresh"));
            } catch (err) {
                toast({title, description: (err as Error).message, variant: "destructive"});
            } finally {
                setMutating(null);
            }
        },
        [mutating, onMutated, toast]
    );

    const stageFile = React.useCallback(() => {
        void runMutation({action: "stage", files: [path]}, "Stage file");
    }, [runMutation, path]);

    const discardFile = React.useCallback(() => {
        void runMutation({action: "discard", files: [path]}, "Discard changes");
    }, [runMutation, path]);

    const stageHunk = React.useCallback(
        (patch: string, hunkNo: number) => {
            void runMutation({action: "stageHunk", path, patch}, `Stage hunk ${hunkNo}`);
        },
        [runMutation, path]
    );

    // The unstage pair — mirror images of the stage callbacks above.
    // `git restore --staged` for the whole file (the route falls back
    // to `git reset HEAD --` / `git rm --cached` on ancient or
    // unborn-repo gits), `git apply -R --cached` for one sliced hunk.
    const unstageFile = React.useCallback(() => {
        void runMutation({action: "unstage", files: [path]}, "Unstage file");
    }, [runMutation, path]);

    const unstageHunk = React.useCallback(
        (patch: string, hunkNo: number) => {
            void runMutation({action: "unstageHunk", path, patch}, `Unstage hunk ${hunkNo}`);
        },
        [runMutation, path]
    );

    if (loading) {
        return (
            <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin"/>
                Loading diff for <code className="font-mono">{path}</code>…
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-start gap-2 p-4 text-xs text-destructive">
                <CircleAlert className="size-4 shrink-0 mt-0.5"/>
                <span>Failed to load diff: {error}</span>
            </div>
        );
    }

    if (!isRepo) {
        return (
            <div className="flex items-start gap-2 p-4 text-xs text-muted-foreground">
                <CircleAlert className="size-4 shrink-0 mt-0.5"/>
                <span>Scripts directory is not inside a git repository.</span>
            </div>
        );
    }

    if (binary && !diff.trim()) {
        // Binary file change — git prints no hunks; say so instead of the
        // misleading "no changes".
        return (
            <div className="flex flex-col items-start gap-2 p-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <CircleAlert className="size-4 shrink-0"/>
                    <span>Binary file changed — the contents cannot be shown line-by-line.</span>
                </div>
            </div>
        );
    }

    if (!diff) {
        // Empty diff + untracked → the file is empty on disk (the
        // --no-index diff of an empty file is empty). Otherwise the
        // empty side of the CURRENT scope — a per-scope message so an
        // empty view is always a meaningful answer (“everything is
        // staged”), not a dead-end “no changes”.
        return (
            <div className="flex flex-col items-start gap-2 p-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <CircleAlert className="size-4 shrink-0"/>
                    <span>
            {isUntracked
                ? scope === "staged"
                    ? "Nothing is staged for this untracked file yet — stage it to preview it here."
                    : "Untracked empty file — write something in it to see the diff."
                : scope === "staged"
                    ? "No staged changes for this file — its staged state matches HEAD."
                    : scope === "unstaged"
                        ? "No unstaged changes for this file — everything is staged (or clean)."
                        : "No changes against HEAD for this file."}
          </span>
                </div>
            </div>
        );
    }

    return (
        <>
            <DiffRows
                path={path}
                diff={diff}
                isUntracked={isUntracked}
                scope={scope}
                onScopeChange={setScope}
                onStageFile={stageFile}
                onUnstageFile={unstageFile}
                onDiscardFile={() => setConfirmDiscard(true)}
                onStageHunk={stageHunk}
                onUnstageHunk={unstageHunk}
                blameOn={blameOn}
                blameLoading={blameLoading}
                blameError={blameError}
                blameLines={blameLines}
                onToggleBlame={() => setBlameOn((v) => !v)}
                mutating={mutating}
            />
            {/* Discard confirmation — destructive, so it asks. */}
            <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                <AlertDialogContent className="max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Trash2 className="size-4 text-red-500"/>
                            Discard changes?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            All uncommitted changes in <code className="font-mono text-[11px]">{path}</code> will
                            be reverted to HEAD (git checkout). This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => {
                                discardFile();
                                setConfirmDiscard(false);
                            }}
                        >
                            Discard changes
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

/* ================================================================== */
/*  DiffRows — the actual side-by-side grid (split from DiffView so    */
/*  the parse only runs when we actually have a diff to show).         */

/* ================================================================== */

function DiffRows({
                      path,
                      diff,
                      isUntracked,
                      scope,
                      onScopeChange,
                      onStageFile,
                      onUnstageFile,
                      onDiscardFile,
                      onStageHunk,
                      onUnstageHunk,
                      blameOn,
                      blameLoading,
                      blameError,
                      blameLines,
                      onToggleBlame,
                      mutating,
                  }: {
    path: string;
    diff: string;
    isUntracked: boolean;
    /** Which pair of trees the grid compares — see DiffScope/SCOPE_META. */
    scope: DiffScope;
    onScopeChange: (s: DiffScope) => void;
    onStageFile: () => void;
    onUnstageFile: () => void;
    onDiscardFile: () => void;
    onStageHunk: (patch: string, hunkNo: number) => void;
    onUnstageHunk: (patch: string, hunkNo: number) => void;
    blameOn: boolean;
    blameLoading: boolean;
    blameError: string | null;
    blameLines: BlameLine[] | null;
    onToggleBlame: () => void;
    mutating: string | null;
}) {
    const rows = React.useMemo(() => parseUnifiedDiff(diff), [diff]);

    /* "Open in editor" — reconstruct BOTH full sides from the parsed
     * rows (context rows fill the unchanged lines between hunks) and
     * hand them to the editor's DiffView surface via praxis:open-diff.
     * The left side (HEAD) is read-only history; the right side is the
     * working tree — editable + saveable when the panel knows the
     * project file. */
    const openDiffInEditor = () => {
        const leftLines: string[] = [];
        const rightLines: string[] = [];
        let lastOld = 0;
        let lastNew = 0;
        for (const r of rows) {
            // Fill any gap since the last hunk row with blanks (the unified
            // diff omits unchanged regions — the editor view shows the
            // diffed regions contiguously, which is exactly what a diff
            // surface should show).
            if (r.oldNumber !== null) {
                leftLines.push(r.oldText ?? "");
                lastOld = r.oldNumber;
            }
            if (r.newNumber !== null) {
                rightLines.push(r.newText ?? "");
                lastNew = r.newNumber;
            }
        }
        window.dispatchEvent(new CustomEvent("praxis:open-diff", {
            detail: {
                title: `${path || "file"} — HEAD vs working tree`,
                leftLabel: `${path || "file"} (HEAD)`,
                leftContent: leftLines.join("\n"),
                rightLabel: `${path || "file"} (working tree)`,
                rightContent: rightLines.join("\n"),
                // The repo-relative path lets the page resolve the working-tree
                // side to the real project file — the diff surface then becomes
                // EDITABLE, with save-from-diff writing through the normal path.
                rightFilePath: path,
            },
        }));
    };

    // One appliable patch per @@ hunk.
    const hunkPatches = React.useMemo(() => splitHunkPatches(diff), [diff]);

    /* Blame gutter line → run-start BlameLine (the gutter
     * renders the annotation once per consecutive same-commit run). */
    const blameRunStarts = React.useMemo(() => {
        const starts = new Map<number, BlameLine>();
        if (!blameLines) return starts;
        for (const run of groupBlameRuns(blameLines)) {
            // The first line of the run carries the annotation.
            const first = run.lines[0];
            if (first !== undefined) starts.set(first, {
                sha: run.sha,
                author: run.author,
                authorTime: run.authorTime,
                summary: run.summary,
                uncommitted: run.uncommitted,
                boundary: false,
                finalLine: first,
            });
        }
        return starts;
    }, [blameLines]);

    return (
        <ScrollArea className="h-full">
            <div className="min-w-full text-xs font-mono">
                {/* File header strip — path, counts, the scope toggle, and
           * the per-file actions (Stage ⇄ Unstage / Discard / Blame — + 1d). */}
                <div
                    className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b backdrop-blur">
                    <FileCode2 className="size-3.5 text-muted-foreground shrink-0"/>
                    <span className="truncate" title={path}>{path}</span>
                    <span className="text-[10px] text-muted-foreground font-sans shrink-0">
            {rows.filter((r) => r.type === "added" || r.type === "modified").length} additions ·{" "}
                        {rows.filter((r) => r.type === "removed" || r.type === "modified").length} removals
          </span>
                    {/* Scope toggle — which pair of trees the grid below
           * compares (same segmented-control pattern as the log
           * dialog's List/Graph switch). Staged flips the action
           * family to Unstage so the patch being sliced always
           * matches the tree it will be applied to. */}
                    <span
                        className="flex items-center rounded-md border overflow-hidden shrink-0"
                        role="group"
                        aria-label="Diff scope"
                    >
            {SCOPE_ORDER.map((s) => (
                <button
                    key={s}
                    type="button"
                    onClick={() => onScopeChange(s)}
                    className={cn(
                        "px-1.5 py-0.5 text-[9px] font-medium transition-colors",
                        scope === s
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50"
                    )}
                    aria-pressed={scope === s}
                    title={SCOPE_META[s].hint}
                >
                    {SCOPE_META[s].label}
                </button>
            ))}
          </span>
                    <span className="flex-1"/>
                    {scope === "staged" ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 gap-1 text-[10px] px-1.5 shrink-0"
                            onClick={onUnstageFile}
                            disabled={!!mutating}
                            title="git restore --staged — remove this file's staged changes from the index (the working tree is untouched)"
                        >
                            {mutating === "Unstage file" ? <Loader2 className="size-3 animate-spin"/> :
                                <Minus className="size-3"/>}
                            Unstage file
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 gap-1 text-[10px] px-1.5 shrink-0"
                            onClick={onStageFile}
                            disabled={!!mutating}
                            title="git add — stage the whole file for the next commit"
                        >
                            {mutating === "Stage file" ? <Loader2 className="size-3 animate-spin"/> :
                                <Plus className="size-3"/>}
                            Stage file
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 gap-1 text-[10px] px-1.5 shrink-0 text-red-500 hover:bg-red-500/10"
                        onClick={onDiscardFile}
                        disabled={!!mutating || isUntracked}
                        title={
                            isUntracked
                                ? "Untracked file — nothing staged/tracked to revert (delete it in the explorer instead)"
                                : "git checkout -- — revert this file to HEAD (asks first)"
                        }
                    >
                        {mutating === "Discard changes" ? <Loader2 className="size-3 animate-spin"/> :
                            <Trash2 className="size-3"/>}
                        Discard
                    </Button>
                    <Button
                        variant={blameOn ? "default" : "ghost"}
                        size="sm"
                        className="h-5 gap-1 text-[10px] px-1.5 shrink-0"
                        onClick={onToggleBlame}
                        disabled={isUntracked || blameLoading}
                        aria-pressed={blameOn}
                        title={
                            isUntracked
                                ? "Blame needs the file to be tracked by git"
                                : blameOn
                                    ? "Hide the inline blame gutter"
                                    : "git blame --porcelain -w — show who last touched each line"
                        }
                    >
                        {blameLoading ? <Loader2 className="size-3 animate-spin"/> : <User className="size-3"/>}
                        Blame
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 gap-1 text-[10px] px-1.5 shrink-0"
                        onClick={openDiffInEditor}
                        disabled={rows.length === 0}
                        title="Open this diff in the editor surface — side-by-side panes with word-level highlights"
                    >
                        <ExternalLink className="size-3"/>
                        Open in editor
                    </Button>
                </div>

                {/* Blame status line — only while the mode is on. */}
                {blameOn && blameError && (
                    <div className="px-3 py-1 text-[10px] text-amber-600 dark:text-amber-400 border-b bg-amber-500/5">
                        Blame unavailable: {blameError}
                    </div>
                )}

                {/* Column headers — the pair of trees the scope compares */}
                <div
                    className="grid grid-cols-2 sticky top-[34px] z-[5] bg-muted/40 border-b text-[10px] uppercase tracking-wider text-muted-foreground font-sans">
                    <div className="px-3 py-1 border-r">{SCOPE_META[scope].left}</div>
                    <div className="px-3 py-1">{SCOPE_META[scope].right}</div>
                </div>

                {/* Rows — hunk boundaries get their own action strip: the
         * Stage hunk button (git apply --cached with exactly that
         * hunk's patch, sliced from the raw diff above) or, in the
         * staged scope, its mirror Unstage hunk (git apply -R
         * --cached on the same slice of the CACHED diff). */}
                <div className="grid grid-cols-2">
                    {rows.map((row, idx) => {
                        const prev = rows[idx - 1];
                        const isHunkStart = row.hunkIndex >= 0 && (!prev || prev.hunkIndex !== row.hunkIndex);
                        return (
                            <React.Fragment key={idx}>
                                {isHunkStart && (
                                    <div
                                        className="col-span-2 flex items-center gap-2 px-2 py-0.5 bg-muted/30 border-b border-border/60">
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground select-none">
                      Hunk {row.hunkIndex + 1}
                    </span>
                                        {scope === "staged" ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-4 gap-1 text-[9px] px-1.5"
                                                onClick={() => onUnstageHunk(hunkPatches[row.hunkIndex] ?? "", row.hunkIndex + 1)}
                                                disabled={!!mutating || !hunkPatches[row.hunkIndex]}
                                                title="git apply -R --cached — remove ONLY this hunk's staged changes from the index (working tree untouched)"
                                            >
                                                {mutating === `Unstage hunk ${row.hunkIndex + 1}` ? (
                                                    <Loader2 className="size-2.5 animate-spin"/>
                                                ) : (
                                                    <Minus className="size-2.5"/>
                                                )}
                                                Unstage hunk
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-4 gap-1 text-[9px] px-1.5"
                                                onClick={() => onStageHunk(hunkPatches[row.hunkIndex] ?? "", row.hunkIndex + 1)}
                                                disabled={!!mutating || !hunkPatches[row.hunkIndex]}
                                                title="git apply --cached — stage ONLY this hunk for the next commit"
                                            >
                                                {mutating === `Stage hunk ${row.hunkIndex + 1}` ? (
                                                    <Loader2 className="size-2.5 animate-spin"/>
                                                ) : (
                                                    <Plus className="size-2.5"/>
                                                )}
                                                Stage hunk
                                            </Button>
                                        )}
                                    </div>
                                )}
                                <DiffRowCells
                                    row={row}
                                    blame={
                                        blameOn && row.newNumber !== null
                                            ? blameRunStarts.get(row.newNumber) ?? null
                                            : null
                                    }
                                    blameActive={blameOn}
                                />
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </ScrollArea>
    );
}

/* ================================================================== */
/*  DiffRowCells — one logical row across both columns                 */

/* ================================================================== */

function DiffRowCells({
                          row,
                          blame,
                          blameActive,
                      }: {
    row: DiffRow;
    /** Run-start blame entry for the NEW-side line (null = continuation
     *  of the previous run → empty gutter cell). */
    blame: BlameLine | null;
    blameActive: boolean;
}) {
    // Background tint per column based on row type.
    const leftBg =
        row.type === "removed" || row.type === "modified"
            ? "bg-red-500/10"
            : row.type === "added"
                ? "bg-muted/30" // empty gutter on the left for added rows
                : "";
    const rightBg =
        row.type === "added" || row.type === "modified"
            ? "bg-emerald-500/10"
            : row.type === "removed"
                ? "bg-muted/30" // empty gutter on the right for removed rows
                : "";

    const leftText =
        row.type === "removed" || row.type === "modified" || row.type === "context"
            ? row.oldText ?? ""
            : "";
    const rightText =
        row.type === "added" || row.type === "modified" || row.type === "context"
            ? row.newText ?? ""
            : "";

    return (
        <>
            {/* Left cell */}
            <div
                className={cn(
                    "flex items-start min-h-[1.25rem] border-r",
                    leftBg,
                    row.type === "context" && "text-muted-foreground",
                    row.type === "removed" && "text-red-900 dark:text-red-200",
                    row.type === "modified" && "text-red-900 dark:text-red-200",
                    row.type === "added" && "text-muted-foreground/40"
                )}
            >
        <span
            className="select-none w-10 shrink-0 text-right pr-1.5 text-[10px] text-muted-foreground/60 border-r border-border/40 py-0.5">
          {row.oldNumber ?? ""}
        </span>
                <pre className="whitespace-pre-wrap break-words px-2 py-0.5 flex-1 leading-relaxed">
          {leftText || (row.type === "added" ? "" : " ")}
        </pre>
            </div>

            {/* Right cell — with the inline blame gutter prepended when the
       * mode is on short sha · author · relative date, drawn
       * once per blame run (editors keep continuation lines blank). */}
            <div
                className={cn(
                    "flex items-start min-h-[1.25rem]",
                    rightBg,
                    row.type === "context" && "text-muted-foreground",
                    row.type === "added" && "text-emerald-900 dark:text-emerald-200",
                    row.type === "modified" && "text-emerald-900 dark:text-emerald-200",
                    row.type === "removed" && "text-muted-foreground/40"
                )}
            >
                {blameActive && (
                    <span
                        className={cn(
                            "select-none shrink-0 w-44 truncate pr-2 text-[9px] py-0.5 border-r border-border/40",
                            blame?.uncommitted
                                ? "text-amber-600 dark:text-amber-400 bg-amber-500/5"
                                : "text-muted-foreground/80 bg-muted/20",
                            row.type === "removed" && "opacity-40"
                        )}
                        title={
                            blame
                                ? blame.uncommitted
                                    ? "Uncommitted working-tree line"
                                    : `${blame.sha.slice(0, 12)} — ${blame.author} — ${blameRelTime(blame.authorTime)} — ${blame.summary}`
                                : undefined
                        }
                    >
            {blame
                ? blame.uncommitted
                    ? "you (not committed yet)"
                    : `${blame.sha.slice(0, 7)} ${blame.author} ${blameRelTime(blame.authorTime)}`
                : ""}
          </span>
                )}
                <span
                    className="select-none w-10 shrink-0 text-right pr-1.5 text-[10px] text-muted-foreground/60 border-r border-border/40 py-0.5">
          {row.newNumber ?? ""}
        </span>
                <pre className="whitespace-pre-wrap break-words px-2 py-0.5 flex-1 leading-relaxed">
          {rightText || (row.type === "removed" ? "" : " ")}
        </pre>
            </div>
        </>
    );
}

/* ================================================================== */
/*  MultiFileDiffPreview — shared read-only multi-file diff renderer   */

/* ================================================================== */

/**
 * Presentational multi-file diff: one header strip per file (path +
 * additions/removals) and the SAME side-by-side grid rows the live
 * panel renders — WITHOUT the stage/unstage/discard/blame affordances
 * (those belong to the working-tree panel; this is a review surface).
 *
 * Reused by:
 *  - the stash dialog's per-stash preview (`git stash show -p` output
 *    split with splitFileDiffSections);
 *  - the commit dialog's "Review changes" area (per-checked-file
 *    sections with KNOWN paths, fetched through the same
 *    /api/git-diff-content route the panel uses).
 *
 * The caller owns the scroll container — this component sizes itself
 * to its content so it composes with any ScrollArea/max-h box.
 */
export function MultiFileDiffPreview({
                                         sections,
                                         columns,
                                         emptyLabel = "No textual changes.",
                                     }: {
    /** Per-file sections (path + that file's raw unified diff). */
    sections: DiffFileSection[];
    /** Optional column-header labels [old, new] — a plain pair renders
     *  when omitted. */
    columns?: [string, string];
    emptyLabel?: string;
}) {
    const visible = sections.filter((s) => s.diff.trim());
    if (visible.length === 0) {
        return (
            <div className="flex items-start gap-2 p-3 text-xs text-muted-foreground">
                <CircleAlert className="size-3.5 shrink-0 mt-0.5"/>
                <span>{emptyLabel}</span>
            </div>
        );
    }
    return (
        <div className="min-w-full text-xs font-mono">
            {columns && (
                <div
                    className="grid grid-cols-2 bg-muted/40 border-b text-[10px] uppercase tracking-wider text-muted-foreground font-sans">
                    <div className="px-3 py-1 border-r">{columns[0]}</div>
                    <div className="px-3 py-1">{columns[1]}</div>
                </div>
            )}
            {visible.map((s, i) => (
                <FilePreviewSection key={`${s.path}#${i}`} section={s}/>
            ))}
        </div>
    );
}

/** One file's slice inside a MultiFileDiffPreview — header strip +
 *  side-by-side rows (parseUnifiedDiff + DiffRowCells reuse). */
function FilePreviewSection({section}: { section: DiffFileSection }) {
    const rows = React.useMemo(() => parseUnifiedDiff(section.diff), [section.diff]);
    const adds = rows.filter((r) => r.type === "added" || r.type === "modified").length;
    const dels = rows.filter((r) => r.type === "removed" || r.type === "modified").length;
    return (
        <div className="border-b last:border-b-0">
            <div className="flex items-center gap-2 px-3 py-1 bg-muted/50 border-b">
                <FileCode2 className="size-3.5 text-muted-foreground shrink-0"/>
                <span className="truncate" title={section.path}>{section.path}</span>
                <span className="text-[10px] text-muted-foreground font-sans shrink-0">
          {adds} additions · {dels} removals
        </span>
            </div>
            <div className="grid grid-cols-2">
                {rows.map((row, idx) => (
                    <DiffRowCells key={idx} row={row} blame={null} blameActive={false}/>
                ))}
            </div>
        </div>
    );
}
