"use client";

import * as React from "react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {
    FileDiff,
    GitBranch,
    GitCommitHorizontal,
    GitMerge,
    List,
    Loader2,
    Network,
    RefreshCw,
    Undo2,
    User
} from "lucide-react";
import {useToast} from "@/hooks/use-toast";

interface CommitSummary {
    sha: string;
    shortSha: string;
    author: string;
    authorEmail: string;
    timestamp: number;
    subject: string;
    /** parent shas (%P) — lane computation input. */
    parents: string[];
    /** decoration string (%D) — branch/HEAD labels. */
    refs: string;
}

interface CommitDetail {
    sha: string;
    shortSha: string;
    author: string;
    authorEmail: string;
    committer: string;
    timestamp: number;
    message: string;
    parents: string[];
    files: Array<{ path: string; status: string }>;
    patch: string;
}

/** Status letter → color + tooltip label (matches the sidebar badges). */
function statusStyle(s: string): { className: string; label: string } {
    switch (s) {
        case "A":
            return {className: "text-emerald-600 dark:text-emerald-400", label: "Added"};
        case "M":
            return {className: "text-amber-600 dark:text-amber-400", label: "Modified"};
        case "D":
            return {className: "text-red-600 dark:text-red-400", label: "Deleted"};
        case "R":
            return {className: "text-sky-600 dark:text-sky-400", label: "Renamed"};
        case "C":
            return {className: "text-purple-600 dark:text-purple-400", label: "Copied"};
        default:
            return {className: "text-muted-foreground", label: s};
    }
}

function relTime(unixSec: number): string {
    const diff = Date.now() / 1000 - unixSec;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} d ago`;
    if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))} mo ago`;
    return `${Math.floor(diff / (86400 * 365))} y ago`;
}

function fullDate(unixSec: number): string {
    return new Date(unixSec * 1000).toLocaleString();
}

/** Lane palette for the graph — VS Code-ish branch colors. */
const LANE_COLORS = [
    "#3b82f6", // blue
    "#22c55e", // green
    "#eab308", // yellow
    "#a855f7", // purple
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#f97316", // orange
    "#94a3b8", // slate
];

interface GraphCell {
    /** Lane of this commit's dot. */
    lane: number;
    /** Merge elbows: from this dot's lane down to an extra parent's
     *  lane (one per additional parent). */
    elbows: Array<{ from: number; to: number }>;
    /** Lane occupancy AFTER this row — lane k is drawn as a vertical
     *  from this row to the next when lanesAfter[k] != null. */
    lanesAfter: Array<string | null>;
    totalLanes: number;
}

/**  — compute branch lanes for the newest-first commit
 *  list (the classic simplified `git log --graph` pass):
 *  - the FIRST parent continues on the same lane;
 *  - each EXTRA parent claims a free lane (merge elbow);
 *  - a sha that is not in the visible window ends its lane (the
 *    history is capped at 300 commits);
 *  - root commits (no parents) end their lane. */
function computeGraphCells(commits: CommitSummary[]): GraphCell[] {
    const visible = new Set(commits.map((c) => c.sha));
    const lanes: Array<string | null> = [];
    const cells: GraphCell[] = [];
    for (const c of commits) {
        // Find (or claim) the lane for this commit.
        let j = lanes.indexOf(c.sha);
        if (j === -1) {
            j = lanes.indexOf(null);
            if (j === -1) {
                lanes.push(c.sha);
                j = lanes.length - 1;
            } else {
                lanes[j] = c.sha;
            }
        }

        const parents = c.parents;
        const first = parents[0] ?? null;
        // Continue the lane only while the parent is visible; beyond the
        // 300-commit window the line just fades out.
        lanes[j] = first !== null && visible.has(first) ? first : null;

        // Merge: every extra parent claims a free lane.
        const elbows: Array<{ from: number; to: number }> = [];
        for (let k = 1; k < parents.length; k++) {
            const p = parents[k];
            if (!visible.has(p)) continue;
            let f = lanes.indexOf(null);
            if (f === -1) {
                lanes.push(p);
                f = lanes.length - 1;
            } else {
                lanes[f] = p;
            }
            elbows.push({from: j, to: f});
        }

        cells.push({
            lane: j,
            elbows,
            lanesAfter: [...lanes],
            totalLanes: lanes.length,
        });
    }
    return cells;
}

/** Split a %D decoration into label badges: "HEAD -> main, origin/main"
 *  → [{"HEAD → main", isHead: true}, {"origin/main", false}]. */
function parseRefs(refs: string): Array<{ label: string; isHead: boolean }> {
    if (!refs) return [];
    return refs
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => ({label: r.replace("HEAD -> ", "HEAD → "), isHead: r.includes("HEAD")}));
}

const GRAPH_ROW = 36;
const GRAPH_LANE_W = 15;
const GRAPH_PAD_X = 11;

/**  — the SVG commit graph drawn beside the rows:
 *  verticals by lane color, curved merge elbows, dots on each commit. */
function CommitGraph({
                         commits,
                         cells,
                         selectedSha,
                     }: {
    commits: CommitSummary[];
    cells: GraphCell[];
    selectedSha: string | null;
}) {
    const maxLanes = cells.reduce((m, c) => Math.max(m, c.totalLanes), 1);
    const width = GRAPH_PAD_X * 2 + maxLanes * GRAPH_LANE_W;
    const height = commits.length * GRAPH_ROW;
    if (height === 0) return null;

    const x = (lane: number) => GRAPH_PAD_X + lane * GRAPH_LANE_W + GRAPH_LANE_W / 2;
    const y = (row: number) => row * GRAPH_ROW + GRAPH_ROW / 2;

    return (
        <svg
            width={width}
            height={height}
            className="absolute left-0 top-0 pointer-events-none select-none shrink-0"
            aria-hidden
        >
            {cells.map((cell, i) => {
                const nextY = Math.min(i + 1, commits.length - 1);
                const isLast = i === commits.length - 1;
                return (
                    <g key={commits[i].sha}>
                        {/* Verticals — every lane alive after this row runs to the
                next row (its color); stops on the last row. */}
                        {cell.lanesAfter.map((laneSha, k) =>
                            laneSha && !isLast ? (
                                <line
                                    key={k}
                                    x1={x(k)}
                                    y1={y(i) + 5}
                                    x2={x(k)}
                                    y2={y(nextY) - 5}
                                    stroke={LANE_COLORS[k % LANE_COLORS.length]}
                                    strokeWidth={1.6}
                                    opacity={0.75}
                                />
                            ) : null
                        )}
                        {/* Merge elbows — a curve from this dot's lane into the
                extra parent's lane. */}
                        {cell.elbows.map((e, k) => {
                            const color = LANE_COLORS[e.to % LANE_COLORS.length];
                            const d =
                                `M ${x(e.from)} ${y(i) + 5} ` +
                                `C ${x(e.from)} ${y(i) + GRAPH_ROW * 0.6}, ` +
                                `${x(e.to)} ${y(i) + GRAPH_ROW * 0.4}, ` +
                                `${x(e.to)} ${y(i) + GRAPH_ROW - 5}`;
                            return (
                                <path key={"e" + k} d={d} fill="none" stroke={color} strokeWidth={1.6} opacity={0.75}/>
                            );
                        })}
                        {/* The commit dot — ring when selected. */}
                        {commits[i].sha === selectedSha ? (
                            <>
                                <circle cx={x(cell.lane)} cy={y(i)} r={7}
                                        fill={LANE_COLORS[cell.lane % LANE_COLORS.length]} opacity={0.25}/>
                                <circle cx={x(cell.lane)} cy={y(i)} r={4}
                                        fill={LANE_COLORS[cell.lane % LANE_COLORS.length]} stroke="currentColor"
                                        className="text-background" strokeWidth={1.5}/>
                            </>
                        ) : (
                            <circle cx={x(cell.lane)} cy={y(i)} r={3.5}
                                    fill={LANE_COLORS[cell.lane % LANE_COLORS.length]}/>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}

/** One +/−/context patch row. */
function PatchLine({line}: { line: string }) {
    const kind = line.startsWith("+++") || line.startsWith("---")
        ? "header"
        : line.startsWith("+")
            ? "add"
            : line.startsWith("-")
                ? "del"
                : line.startsWith("@@")
                    ? "hunk"
                    : "same";
    return (
        <div
            className={
                kind === "add"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : kind === "del"
                        ? "bg-red-500/10 text-red-700 dark:text-red-300"
                        : kind === "hunk"
                            ? "text-sky-600 dark:text-sky-400"
                            : kind === "header"
                                ? "text-muted-foreground"
                                : "text-muted-foreground"
            }
        >
      <span className="whitespace-pre-wrap break-all px-2 leading-relaxed">
        {line || "\u00a0"}
      </span>
        </div>
    );
}

/**
 * the commit-history browser (Tools ▸ Git ▸ Commit
 * history…). Left: the last 300 commits (short sha, subject, author,
 * relative date). Right: the selected commit — message, author/date,
 * changed files with status letters, and the full unified patch with
 * +/− coloring. Fully client-side against GET /api/git-log[?sha=].
 *
 *  — a Graph view joined the flat list: a toggle in the
 * header switches the left pane to an SVG commit graph (branch lanes
 * in the VS Code palette, curved merge elbows, branch/HEAD badges
 * from the %D decorations). Clicking a row still loads the detail on
 * the right — the graph is a navigation view, not a separate dialog.
 */
export function GitLogDialog({
                                 open,
                                 onOpenChange,
                             }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const {toast} = useToast();
    const [commits, setCommits] = React.useState<CommitSummary[] | null>(null);
    const [listError, setListError] = React.useState<string | null>(null);
    const [selectedSha, setSelectedSha] = React.useState<string | null>(null);
    const [detail, setDetail] = React.useState<CommitDetail | null>(null);
    const [detailLoading, setDetailLoading] = React.useState(false);
    const [patchTruncated, setPatchTruncated] = React.useState(false);
    const [refreshNonce, setRefreshNonce] = React.useState(0);
    // "list" (flat, the classic view) or "graph" (SVG
    // lanes + branch badges).
    const [view, setView] = React.useState<"list" | "graph">("list");
    /** Section 6,— per-commit revert: in-flight flag while
     *  git revert --no-edit <sha> runs through /api/git-command. */
    const [reverting, setReverting] = React.useState(false);

    const graphCells = React.useMemo(
        () => (view === "graph" && commits ? computeGraphCells(commits) : []),
        [view, commits]
    );

    // Load the list whenever the dialog opens (or Refresh is clicked).
    React.useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setCommits(null);
        setListError(null);
        setDetail(null);
        setSelectedSha(null);
        (async () => {
            try {
                const res = await fetch("/api/git-log", {cache: "no-store"});
                const data = (await res.json()) as
                    | { ok: true; commits: CommitSummary[] }
                    | { ok: false; hint?: string };
                if (cancelled) return;
                if (data.ok) {
                    setCommits(data.commits);
                    if (data.commits.length > 0) setSelectedSha(data.commits[0].sha);
                } else {
                    setListError(data.hint ?? "Could not read the git history.");
                }
            } catch {
                if (!cancelled) setListError("Could not read the git history.");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, refreshNonce]);

    // Load the detail for the selected sha.
    React.useEffect(() => {
        if (!open || !selectedSha) return;
        let cancelled = false;
        setDetailLoading(true);
        setDetail(null);
        (async () => {
            try {
                const res = await fetch(`/api/git-log?sha=${encodeURIComponent(selectedSha)}`, {
                    cache: "no-store",
                });
                const data = (await res.json()) as
                    | { ok: true; detail: CommitDetail; patchTruncated?: boolean }
                    | { ok: false; error: string };
                if (cancelled) return;
                if (data.ok) {
                    setDetail(data.detail);
                    setPatchTruncated(!!data.patchTruncated);
                } else {
                    toast({title: "Git log", description: data.error, variant: "destructive"});
                }
            } catch {
                if (!cancelled) {
                    toast({title: "Git log", description: "Network error.", variant: "destructive"});
                }
            } finally {
                if (!cancelled) setDetailLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, selectedSha, toast]);

    const patchLines = React.useMemo(
        () => (detail ? detail.patch.split("\n") : []),
        [detail]
    );

    /* ── Revert the selected commit (Section 6,— creates a
     *  NEW commit that undoes the selected one (git revert --no-edit
     *  <sha>, the safe history-preserving inverse). Conflicts surface
     *  git's own stderr; every success refreshes the list AND
     *  broadcasts praxis:git-refresh for the diff panel / branch chip. */
    const handleRevert = async () => {
        if (reverting || !selectedSha) return;
        setReverting(true);
        try {
            const res = await fetch("/api/git-command", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "revert", sha: selectedSha}),
            });
            const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; output?: string };
            if (!res.ok || !data.ok) {
                toast({
                    title: "Revert failed",
                    description: data.error ?? `HTTP ${res.status}`,
                    variant: "destructive"
                });
                return;
            }
            toast({
                title: "Commit reverted",
                description: (data.output ?? "A new commit was created undoing it.").slice(0, 400),
            });
            setRefreshNonce((n) => n + 1);
            window.dispatchEvent(new Event("praxis:git-refresh"));
        } catch (err) {
            toast({title: "Revert failed", description: (err as Error).message, variant: "destructive"});
        } finally {
            setReverting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GitCommitHorizontal className="size-5"/>
                        Commit History
                        {/* List ⇄ Graph view toggle. */}
                        <span className="ml-1 flex items-center rounded-md border overflow-hidden">
              <button
                  onClick={() => setView("list")}
                  className={
                      "flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium transition-colors " +
                      (view === "list" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50")
                  }
                  title="The classic flat list"
                  aria-pressed={view === "list"}
              >
                <List className="size-3"/>
                List
              </button>
              <button
                  onClick={() => setView("graph")}
                  className={
                      "flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium transition-colors " +
                      (view === "graph" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50")
                  }
                  title="The commit graph — branch lanes, merge elbows, branch badges"
                  aria-pressed={view === "graph"}
              >
                <Network className="size-3"/>
                Graph
              </button>
            </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            aria-label="Refresh the commit list"
                            title="Refresh"
                            onClick={() => setRefreshNonce((n) => n + 1)}
                        >
                            <RefreshCw className="size-3.5"/>
                        </Button>
                    </DialogTitle>
                    <DialogDescription>
                        {view === "graph"
                            ? "The commit graph — each lane is a branch, curves are merges; click a commit to see its changed files and diff."
                            : "The last 300 commits of this repository. Click one to see its changed files and diff."}
                    </DialogDescription>
                </DialogHeader>

                {listError ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">{listError}</p>
                ) : commits === null ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                        Reading the git log…
                    </p>
                ) : commits.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                        No commits yet — make the first commit to start the history.
                    </p>
                ) : (
                    <div
                        className={
                            "flex-1 min-h-0 grid gap-2 " +
                            (view === "graph"
                                ? "grid-cols-[minmax(340px,440px)_1fr]"
                                : "grid-cols-[minmax(220px,300px)_1fr]")
                        }
                    >
                        {/* ── Commit list / graph (left) ─────────────────────── */}
                        <div className="min-h-0 overflow-y-auto rounded-md border relative">
                            {view === "graph" && commits.length > 0 && (
                                <CommitGraph commits={commits} cells={graphCells} selectedSha={selectedSha}/>
                            )}
                            {commits.map((c, idx) => {
                                const refs = view === "graph" ? parseRefs(c.refs) : [];
                                const cell = view === "graph" ? graphCells[idx] : null;
                                const paddingLeft =
                                    view === "graph" && cell
                                        ? GRAPH_PAD_X * 2 + cell.totalLanes * GRAPH_LANE_W + 8
                                        : undefined;
                                return (
                                    <button
                                        key={c.sha}
                                        onClick={() => setSelectedSha(c.sha)}
                                        style={paddingLeft ? {paddingLeft} : undefined}
                                        className={
                                            "w-full text-left px-2 border-b last:border-b-0 flex flex-col gap-0.5 " +
                                            (view === "graph" ? "h-9 py-0 justify-center " : "py-1.5 ") +
                                            (c.sha === selectedSha
                                                ? "bg-accent"
                                                : "hover:bg-accent/50")
                                        }
                                    >
                    <span className="text-xs font-medium truncate flex items-center gap-1.5">
                      {view === "graph" && c.parents.length > 1 && (
                          <span title="Merge commit" className="shrink-0 flex items-center">
                          <GitMerge className="size-3 text-violet-500"/>
                        </span>
                      )}
                        <span className="truncate">{c.subject}</span>
                        {refs.length > 0 && view === "graph" && (
                            <span className="flex items-center gap-1 shrink-0">
                          {refs.map((r) => (
                              <span
                                  key={r.label}
                                  className={
                                      "px-1.5 rounded-full text-[9px] font-semibold truncate " +
                                      (r.isHead
                                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                          : "bg-primary/10 text-primary border border-primary/25")
                                  }
                              >
                              {r.label}
                            </span>
                          ))}
                        </span>
                        )}
                    </span>
                                        {refs.length > 0 && view !== "graph" && (
                                            <span className="flex flex-wrap gap-1">
                        {refs.map((r) => (
                            <span key={r.label}
                                  className="px-1.5 py-px rounded-full text-[9px] font-semibold bg-primary/10 text-primary border border-primary/25">
                            {r.label}
                          </span>
                        ))}
                      </span>
                                        )}
                                        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <GitBranch className="size-2.5"/>
                      <span className="font-mono">{c.shortSha}</span>
                      <span className="truncate flex-1">{c.author}</span>
                      <span className="shrink-0">{relTime(c.timestamp)}</span>
                    </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* ── Detail (right) ─────────────────────────────────── */}
                        <div className="min-h-0 flex flex-col gap-2">
                            {detailLoading || !detail ? (
                                <p className="text-xs text-muted-foreground py-6 text-center">
                                    {detailLoading ? "Loading commit…" : "Select a commit."}
                                </p>
                            ) : (
                                <>
                                    <div className="shrink-0 rounded-md border px-3 py-2">
                                        <div className="flex items-start gap-2">
                                            <p className="text-xs font-medium whitespace-pre-wrap break-words flex-1 min-w-0">
                                                {detail.message}
                                            </p>
                                            {/* ── Revert THIS commit — git revert
                          *  --no-edit <sha>; the button rides the detail
                          *  header so the exact commit is visible. */}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-6 gap-1 text-[10px] px-2 shrink-0"
                                                onClick={() => void handleRevert()}
                                                disabled={reverting}
                                                title="git revert --no-edit — create a NEW commit that undoes this one (safe: history is preserved)"
                                            >
                                                {reverting ? <Loader2 className="size-3 animate-spin"/> :
                                                    <Undo2 className="size-3"/>}
                                                Revert
                                            </Button>
                                        </div>
                                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="size-2.5"/>
                          {detail.author} &lt;{detail.authorEmail}&gt;
                      </span>
                                            <span>{fullDate(detail.timestamp)}</span>
                                            <span className="font-mono">{detail.sha.slice(0, 12)}</span>
                                            {detail.parents.length > 0 && (
                                                <span className="font-mono">
                          parent {detail.parents.map((p) => p.slice(0, 7)).join(" ")}
                        </span>
                                            )}
                                        </p>
                                    </div>

                                    {detail.files.length > 0 && (
                                        <div
                                            className="shrink-0 max-h-28 overflow-y-auto rounded-md border px-2 py-1.5">
                                            {detail.files.map((f, i) => {
                                                const st = statusStyle(f.status);
                                                return (
                                                    <div
                                                        key={i}
                                                        className="flex items-center gap-2 text-[11px] py-0.5"
                                                        title={st.label}
                                                    >
                            <span className={"font-mono font-semibold w-3 shrink-0 " + st.className}>
                              {f.status}
                            </span>
                                                        <span className="truncate font-mono" title={f.path}>
                              {f.path}
                            </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div
                                        className="flex-1 min-h-0 overflow-y-auto rounded-md border font-mono text-[11px]">
                                        {patchLines.length > 0 ? (
                                            <>
                                                {patchLines.map((l, i) => (
                                                    <PatchLine key={i} line={l}/>
                                                ))}
                                                {patchTruncated && (
                                                    <p className="px-2 py-1 text-[10px] text-amber-600 dark:text-amber-400">
                                                        Patch truncated at 256 KB — view the full diff in your terminal
                                                        (<span className="font-mono">git show {detail.shortSha}</span>).
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <p className="px-2 py-3 text-[10px] text-muted-foreground flex items-center gap-1.5">
                                                <FileDiff className="size-3"/>
                                                No textual diff for this commit (merge commit or empty change).
                                            </p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
