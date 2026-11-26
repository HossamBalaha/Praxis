"use client";

import * as React from "react";
import {Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {ResizableDialogContent} from "@/components/ui/resizable-dialog";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {Checkbox} from "@/components/ui/checkbox";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Badge} from "@/components/ui/badge";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import {ChevronDown, ChevronRight, CircleAlert, FileCode2, GitCommitHorizontal, Loader2, Sparkles} from "lucide-react";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {getActiveChatProvider, loadSettings} from "@/lib/settings";
// The panel's own diff renderer (parseUnifiedDiff + the side-by-side
// grid, exported without the stage affordances) — the Review changes
// area below reuses it so the commit preview is pixel-identical to
// the Git Diff panel the user already knows.
import {type DiffFileSection, MultiFileDiffPreview} from "@/components/git-diff-panel";

/* ================================================================== */
/*  Types — git-status entry (mirrors /api/git-status)                 */

/* ================================================================== */

interface GitEntry {
    path: string;
    indexStatus: string;
    wtStatus: string;
}

/* ================================================================== */
/*  Status → short label + color (mirrors git-diff-panel)              */

/* ================================================================== */

function statusLabel(entry: GitEntry): string {
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
/*  GitCommitDialog                                                    */

/* ================================================================== */

interface GitCommitDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /**
     * Map of { path: statusChar } — typically the parent's
     * `gitStatusMap`. Keys are the file paths to list; values are
     * status chars (M, ?, A, D, …). The dialog re-derives a friendly
     * label + color from the char.
     */
    gitStatusMap: Record<string, string>;
    /**
     * Fired after a successful commit. The parent typically re-fetches
     * git-status so the file list / dirty count update immediately.
     */
    onCommitted?: () => void;
}

/**
 * Commit dialog — shows a textarea for the commit message and a
 * checklist of every modified file (all checked by default). On
 * confirm, POSTs `{ message, files }` to /api/git-commit, which runs
 * `git add <files>` + `git commit -m "<message>"`. On success: shows
 * a toast, closes the dialog, and fires `onCommitted` so the parent
 * can refresh git-status.
 *
 * A collapsible “Review changes” area between the message and the
 * file list previews EXACTLY what will be committed — the checked
 * files' full HEAD→worktree diffs (staged + unstaged, because the
 * commit itself `git add`s exactly those files), rendered with the
 * diff panel's own side-by-side machinery. It loads lazily (zero
 * requests while collapsed) and refetches whenever the checked set
 * changes while open.
 *
 * Follows the same dialog pattern as ide-dialogs.tsx: the inner form
 * is mounted fresh on each open (Radix unmounts content when closed)
 * so the textarea + checkboxes reset to their defaults for free —
 * no useEffect-driven state-reset needed.
 */
export function GitCommitDialog({
                                    open,
                                    onOpenChange,
                                    gitStatusMap,
                                    onCommitted,
                                }: GitCommitDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <ResizableDialogContent id="git-commit-dialog" defaultW={780} defaultH={620} className="flex flex-col">
                {open && (
                    <CommitForm
                        gitStatusMap={gitStatusMap}
                        onCommitted={onCommitted}
                        onClose={() => onOpenChange(false)}
                    />
                )}
            </ResizableDialogContent>
        </Dialog>
    );
}

/* ================================================================== */
/*  CommitForm — inner (mounted only while the dialog is open)         */

/* ================================================================== */

function CommitForm({
                        gitStatusMap,
                        onCommitted,
                        onClose,
                    }: {
    gitStatusMap: Record<string, string>;
    onCommitted?: () => void;
    onClose: () => void;
}) {
    const {toast} = useToast();
    const paths = React.useMemo(
        () => Object.keys(gitStatusMap).sort((a, b) => a.localeCompare(b)),
        [gitStatusMap]
    );
    const entries = React.useMemo<GitEntry[]>(
        () =>
            paths.map((p) => {
                const ch = gitStatusMap[p] || " ";
                // The map value is the working-tree status char (or the
                // index status when the wt char is a space). Reconstruct a
                // minimal GitEntry so the shared label/color helpers work.
                const wt = ch !== " " ? ch : " ";
                const idx = ch !== " " ? " " : ch;
                return {path: p, indexStatus: idx, wtStatus: wt};
            }),
        [paths, gitStatusMap]
    );

    // All files checked by default. Map for O(1) lookup + toggle.
    const [checked, setChecked] = React.useState<Record<string, boolean>>(() => {
        const m: Record<string, boolean> = {};
        for (const p of paths) m[p] = true;
        return m;
    });
    const [message, setMessage] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    // AI commit-message generation (in flight → spinner).
    const [generating, setGenerating] = React.useState(false);
    // ── "Review changes" — the collapsible preview of exactly what
    //  this commit will record (see the loader effect below).
    const [reviewOpen, setReviewOpen] = React.useState(false);
    const [reviewLoading, setReviewLoading] = React.useState(false);
    const [reviewError, setReviewError] = React.useState<string | null>(null);
    /** Per-checked-file diff sections (null = not loaded yet). */
    const [reviewSections, setReviewSections] = React.useState<DiffFileSection[] | null>(null);
    /** Signature of the checked-file set currently rendered in
     *  reviewSections — the load guard: only refetch when the actual
     *  selection differs from what is on screen. */
    const [reviewSig, setReviewSig] = React.useState<string | null>(null);

    const selectedCount = paths.filter((p) => checked[p]).length;
    const trimmed = message.trim();
    const canSubmit = !busy && trimmed.length > 0 && selectedCount > 0;

    const toggleAll = (val: boolean) => {
        setChecked(() => {
            const m: Record<string, boolean> = {};
            for (const p of paths) m[p] = val;
            return m;
        });
    };

    // ── Generate commit message with AI ────────────────────
    // Fetches the diff of every CHECKED file (git-diff-content is
    // path-based and works for every file kind), then streams a
    // suggestion from the same chat backend the AI sidebar uses
    // (/api/ai-chat, with the configured provider) and fills the
    // textarea. The user can still edit before committing — the message
    // is a draft, never auto-committed.
    const handleGenerateMessage = async () => {
        if (generating || busy || paths.length === 0) return;
        const files = paths.filter((p) => checked[p]);
        if (files.length === 0) {
            toast({title: "Check at least one file first.", variant: "destructive"});
            return;
        }
        setGenerating(true);
        try {
            // Compact per-file diffs (truncated — the prompt stays small
            // even when the change is huge). Failures are non-fatal: the
            // file list alone still makes a usable prompt.
            const diffs = await Promise.all(
                files.slice(0, 12).map(async (p) => {
                    try {
                        const res = await fetch(
                            `/api/git-diff-content?path=${encodeURIComponent(p)}`
                        );
                        const data = await res.json();
                        if (
                            res.ok &&
                            typeof data.diff === "string" &&
                            data.diff.trim()
                        ) {
                            return `--- ${p} ---\n${data.diff.slice(0, 1600)}`;
                        }
                    } catch {
                        /* per-file failure is non-fatal */
                    }
                    return `--- ${p} --- (no diff available; git status "${
                        gitStatusMap[p] ?? "?"
                    }")`;
                })
            );
            const fileList = files
                .map((p) => `- ${p} (git status: ${gitStatusMap[p] ?? "?"})`)
                .join("\n");
            const prompt =
                `Write a git commit message for the changes below. Rules: the first line is at most 50 characters, imperative mood ("Add …", "Fix …"), no trailing period. If the change needs a short explanation, add a blank line then at most 3 body lines. Reply with ONLY the commit message text — no quotes, no markup.\n\nFiles:\n${fileList}\n\nDiffs (truncated):\n${diffs.join(
                    "\n\n"
                )}`;

            // Same provider resolution as the AI chat sidebar — the user's
            // configured model applies immediately. No provider → the
            // request still sends and the server replies with the
            // "add an OpenAI-compatible provider" guidance.
            const chatProvider = getActiveChatProvider(loadSettings());
            const res = await fetch("/api/ai-chat", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    messages: [{role: "user" as const, content: prompt}],
                    ...(chatProvider
                        ? {
                            provider: {
                                kind: chatProvider.kind,
                                baseUrl: chatProvider.baseUrl,
                                apiKey: chatProvider.apiKey,
                                model: chatProvider.model,
                            },
                        }
                        : {}),
                }),
            });
            if (!res.ok || !res.body) {
                throw new Error(`AI request failed (HTTP ${res.status})`);
            }
            // Parse the SSE stream: `data: {json}` lines carrying
            // choices[0].delta.content, terminated by `data: [DONE]`.
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            let out = "";
            for (; ;) {
                const {done, value} = await reader.read();
                if (done) break;
                buf += decoder.decode(value, {stream: true});
                const parts = buf.split("\n\n");
                buf = parts.pop() ?? "";
                for (const part of parts) {
                    const line = part
                        .split("\n")
                        .find((l) => l.startsWith("data:"));
                    if (!line) continue;
                    const payload = line.slice(5).trim();
                    if (!payload || payload === "[DONE]") continue;
                    let obj: {
                        error?: unknown;
                        choices?: Array<{
                            delta?: { content?: unknown };
                            message?: { content?: unknown };
                        }>;
                    };
                    try {
                        obj = JSON.parse(payload);
                    } catch {
                        continue; // keep-alive comment or split chunk
                    }
                    if (obj?.error) {
                        throw new Error(String(obj.error));
                    }
                    const delta =
                        obj?.choices?.[0]?.delta?.content ??
                        obj?.choices?.[0]?.message?.content;
                    if (typeof delta === "string") out += delta;
                }
            }
            // Strip surrounding quotes/backticks some models add.
            const cleaned = out
                .trim()
                .replace(/^["'`]+/, "")
                .replace(/["'`]+$/, "")
                .trim();
            if (!cleaned) {
                throw new Error(
                    "The AI returned an empty message. Try again or write it manually."
                );
            }
            setMessage(cleaned);
        } catch (err) {
            toast({
                title: "Could not generate a commit message",
                description: (err as Error).message,
                variant: "destructive",
            });
        } finally {
            setGenerating(false);
        }
    };

    // ── Review-changes loader ─────────────────────────────
    // Fetches each CHECKED file's diff through the SAME
    // /api/git-diff-content route the diff panel uses (untracked files
    // via the route's untracked=1 /dev/null mode) and renders them with
    // the panel's own side-by-side machinery. Why the FULL HEAD→worktree
    // diff and not `git diff --cached`: this dialog commits the CHECKED
    // files' working-tree state (the route runs `git add <files>` right
    // before `git commit -- <files>`), so the checked files' staged +
    // unstaged changes TOGETHER are exactly what will be recorded —
    // showing only what happens to be staged right now would silently
    // omit the not-yet-staged edits that the commit WILL include.
    // Lazy by design: zero requests while collapsed; expanding (or
    // changing the checked set while open) loads, aborting the previous
    // in-flight fetch so rapid checkbox toggling never races.
    React.useEffect(() => {
        if (!reviewOpen) return;
        const files = paths.filter((p) => checked[p]);
        if (files.length === 0) {
            setReviewSections([]);
            setReviewSig(null);
            setReviewLoading(false);
            setReviewError(null);
            return;
        }
        const sig = files.join("\n");
        if (sig === reviewSig && reviewSections !== null) return; // already rendered
        const controller = new AbortController();
        setReviewLoading(true);
        setReviewError(null);
        (async () => {
            try {
                // Cap the fetch fan-out (the AI-message flow caps at 12 — the
                // review needs the REAL content, so allow more; the note below
                // the list tells the user when the preview is capped).
                const slice = files.slice(0, 40);
                const sections: DiffFileSection[] = await Promise.all(
                    slice.map(async (p) => {
                        const qs = new URLSearchParams({path: p});
                        if ((gitStatusMap[p] ?? " ") === "?") qs.set("untracked", "1");
                        const res = await fetch(`/api/git-diff-content?${qs.toString()}`, {
                            signal: controller.signal,
                            cache: "no-store",
                        });
                        const data = (await res.json().catch(() => ({}))) as {
                            ok?: boolean;
                            diff?: string;
                            error?: string;
                        };
                        if (!res.ok || !data.ok) {
                            throw new Error(data.error || `HTTP ${res.status}`);
                        }
                        return {path: p, diff: typeof data.diff === "string" ? data.diff : ""};
                    })
                );
                if (controller.signal.aborted) return;
                setReviewSections(sections);
                setReviewSig(sig);
            } catch (err) {
                if ((err as Error).name === "AbortError") return;
                setReviewError((err as Error).message);
            } finally {
                // An aborted load must not un-busy its own replacement.
                if (!controller.signal.aborted) setReviewLoading(false);
            }
        })();
        return () => controller.abort();
    }, [reviewOpen, paths, checked, gitStatusMap, reviewSig, reviewSections]);

    const handleSubmit = async () => {
        if (!canSubmit) return;
        const files = paths.filter((p) => checked[p]);
        setBusy(true);
        try {
            const res = await fetch("/api/git-commit", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({message: trimmed, files}),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            toast({
                title: "Committed",
                description: data.message || `Committed ${files.length} file${files.length === 1 ? "" : "s"}.`,
                variant: "success",
            });
            onCommitted?.();
            onClose();
        } catch (err) {
            toast({
                title: "Commit failed",
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
                    <GitCommitHorizontal className="size-5"/>
                    Commit Changes
                </DialogTitle>
                <DialogDescription>
                    Stage the selected files and create a git commit with the message below —
                    expand “Review changes” to see exactly what will be recorded.
                </DialogDescription>
            </DialogHeader>

            {/* Commit message */}
            <div className="grid gap-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="commit-message">Commit message</Label>
                    {/* AI-generated commit message — drafts from the
              checked files' diffs; the textarea stays editable. */}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 gap-1.5 text-[11px] px-2"
                        onClick={() => void handleGenerateMessage()}
                        disabled={generating || busy || paths.length === 0 || selectedCount === 0}
                        title="Generate a draft commit message from the selected files' diffs (the integrated AI chat backend) — you can edit it before committing"
                    >
                        {generating ? (
                            <>
                                <Loader2 className="size-3 animate-spin"/>
                                Generating…
                            </>
                        ) : (
                            <>
                                <Sparkles className="size-3 text-violet-500"/>
                                Generate with AI
                            </>
                        )}
                    </Button>
                </div>
                <Textarea
                    id="commit-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe what these changes do — or click Generate with AI to draft one from the diffs…"
                    autoFocus
                    rows={3}
                    className="font-mono text-sm resize-none"
                    onKeyDown={(e) => {
                        // ⌘↵ / Ctrl+↵ submits. preventDefault + stopPropagation so
                        // no global listener  also reacts to the combo.
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleSubmit();
                        }
                    }}
                />
                <p className="text-[10px] text-muted-foreground">
                    Tip: ⌘↵ (Ctrl+↵) to commit.
                </p>
            </div>

            {/* Review changes — collapsible preview of EXACTLY what this
       * commit will record (the checked files' full diffs, rendered
       * with the Git Diff panel's own machinery). Collapsed by
       * default — most commits are small; expand to double-check
       * before the Commit button fires. */}
            <Collapsible open={reviewOpen} onOpenChange={setReviewOpen}>
                <div className="flex items-center gap-2">
                    <CollapsibleTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 text-[11px] px-2"
                            disabled={paths.length === 0}
                            aria-expanded={reviewOpen}
                            title="Expand to preview every checked file's diff — exactly what this commit will record"
                        >
                            {reviewLoading ? (
                                <Loader2 className="size-3 animate-spin"/>
                            ) : reviewOpen ? (
                                <ChevronDown className="size-3"/>
                            ) : (
                                <ChevronRight className="size-3"/>
                            )}
                            Review changes{selectedCount > 0 ? ` (${selectedCount})` : ""}
                        </Button>
                    </CollapsibleTrigger>
                    <span className="text-[10px] text-muted-foreground truncate">
            the checked files' full diff (staged + unstaged) — exactly what will be committed
          </span>
                </div>
                <CollapsibleContent>
                    <div className="mt-1 rounded-md border overflow-hidden max-h-64 flex flex-col">
                        {reviewError ? (
                            <div className="flex items-start gap-2 p-3 text-xs text-destructive">
                                <CircleAlert className="size-3.5 shrink-0 mt-0.5"/>
                                <span>Failed to load the diffs: {reviewError}</span>
                            </div>
                        ) : reviewLoading && reviewSections === null ? (
                            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                                <Loader2 className="size-3.5 animate-spin"/>
                                Loading the checked files' diffs…
                            </div>
                        ) : (
                            <ScrollArea className="flex-1 min-h-0">
                                <MultiFileDiffPreview
                                    sections={reviewSections ?? []}
                                    columns={["HEAD (old)", "To be committed (new)"]}
                                    emptyLabel={
                                        selectedCount === 0
                                            ? "Check at least one file to preview what will be committed."
                                            : "The checked files have no textual changes (binary-only or empty diffs)."
                                    }
                                />
                                {selectedCount > 40 && (
                                    <p className="px-3 py-1 text-[10px] text-amber-600 dark:text-amber-400 border-t">
                                        Preview capped at the first 40 checked files — every checked file is committed
                                        regardless.
                                    </p>
                                )}
                            </ScrollArea>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>

            {/* File list */}
            <div className="flex flex-col flex-1 min-h-0 rounded-md border overflow-hidden">
                {/* File list header — select-all controls */}
                <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
                    <Checkbox
                        id="commit-select-all"
                        checked={paths.length > 0 && selectedCount === paths.length}
                        onCheckedChange={(v) => toggleAll(v === true)}
                        disabled={paths.length === 0 || busy}
                    />
                    <Label
                        htmlFor="commit-select-all"
                        className="text-xs font-medium cursor-pointer flex-1"
                    >
                        {selectedCount === paths.length && paths.length > 0
                            ? `All ${paths.length} file${paths.length === 1 ? "" : "s"} selected`
                            : `${selectedCount} of ${paths.length} file${paths.length === 1 ? "" : "s"} selected`}
                    </Label>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => toggleAll(true)}
                        disabled={paths.length === 0 || busy}
                    >
                        Select all
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => toggleAll(false)}
                        disabled={paths.length === 0 || busy}
                    >
                        None
                    </Button>
                </div>

                {/* Scrollable file list */}
                <ScrollArea className="flex-1 min-h-0">
                    {paths.length === 0 ? (
                        <div
                            className="flex flex-col items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
                            <FileCode2 className="size-8 opacity-40"/>
                            <span>No modified files to commit.</span>
                        </div>
                    ) : (
                        <ul className="divide-y">
                            {entries.map((e) => (
                                <li
                                    key={e.path}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50 transition-colors",
                                        !checked[e.path] && "opacity-60"
                                    )}
                                >
                                    <Checkbox
                                        id={`commit-file-${e.path}`}
                                        checked={!!checked[e.path]}
                                        onCheckedChange={(v) =>
                                            setChecked((prev) => ({...prev, [e.path]: v === true}))
                                        }
                                        disabled={busy}
                                    />
                                    <Label
                                        htmlFor={`commit-file-${e.path}`}
                                        className="text-xs font-mono cursor-pointer flex-1 min-w-0 truncate"
                                        title={e.path}
                                    >
                                        {e.path}
                                    </Label>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "text-[10px] font-sans shrink-0 px-1.5 py-0",
                                            statusBadgeClass(e)
                                        )}
                                    >
                                        {statusLabel(e)}
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                    )}
                </ScrollArea>
            </div>

            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!canSubmit}>
                    {busy ? (
                        <>
                            <Loader2 className="size-4 animate-spin"/>
                            Committing…
                        </>
                    ) : (
                        <>
                            <GitCommitHorizontal className="size-4"/>
                            Commit {selectedCount > 0 ? `(${selectedCount})` : ""}
                        </>
                    )}
                </Button>
            </DialogFooter>
        </>
    );
}
