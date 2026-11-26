"use client";

import * as React from "react";
import {
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    ChevronsDownUp,
    ChevronsUpDown,
    CircleSlash,
    ListTree,
    RefreshCw
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";
import {cn} from "@/lib/utils";

/**
 * AstExplorerPanel — the Python AST explorer dialog: a collapsible
 * node TREE (left rail) synced two-way with the file's SOURCE lines
 * (right pane).
 *
 * ▸ clicking a tree node highlights its exact source range (emerald
 *   background) and scrolls it into view;
 * ▸ clicking a SOURCE line selects the deepest node containing that
 *   line — un-collapsing its ancestors and scrolling the tree row
 *   into view;
 * ▸ the header filter narrows the tree to matching KINDS (ancestors
 *   kept for context, matching count shown, collapse state ignored
 *   so every match is revealed);
 * ▸ Expand all / Collapse all flip the whole tree in one click;
 * ▸ truncated responses render an amber notice.
 *
 * The AST comes from GET /api/ast (folder + file + optional code
 * override); the source pane renders the editor buffer passed as
 * `code` (without it the tree still works, just without highlighting).
 */

/** One AST node from GET /api/ast — exact backend contract shape. */
interface AstNode {
    kind: string;
    label: string;
    line: number;
    col: number;
    endLine: number;
    endCol: number;
    depth: number;
    attrs: Record<string, string>;
    children: AstNode[];
}

interface AstApiResult {
    ok: boolean;
    fileName?: string;
    nodes?: AstNode[];
    truncated?: boolean;
    error?: string;
}

/** Flattened tree entry — stable id (path of kind@line:col) per node. */
interface FlatAst {
    id: string;
    node: AstNode;
    parentId: string | null;
    childCount: number;
    depth: number;
}

// ─── response validation (unknown → typed, no casts of raw JSON) ─────

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function numOr(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Recursively validate + normalize one raw node; null when malformed. */
function cleanAstNode(value: unknown): AstNode | null {
    const r = asRecord(value);
    if (!r) return null;
    if (typeof r.kind !== "string" || typeof r.label !== "string") return null;
    const attrs: Record<string, string> = {};
    const rawAttrs = asRecord(r.attrs);
    if (rawAttrs) {
        for (const [k, v] of Object.entries(rawAttrs)) {
            if (typeof v === "string") attrs[k] = v;
        }
    }
    const children: AstNode[] = Array.isArray(r.children)
        ? r.children.map(cleanAstNode).filter((c): c is AstNode => c !== null)
        : [];
    return {
        kind: r.kind,
        label: r.label,
        line: numOr(r.line, 1),
        col: numOr(r.col, 0),
        endLine: numOr(r.endLine, numOr(r.line, 1)),
        endCol: numOr(r.endCol, 0),
        depth: numOr(r.depth, 0),
        attrs,
        children,
    };
}

function parseAstResponse(json: unknown): AstApiResult | null {
    const r = asRecord(json);
    if (!r) return null;
    return {
        ok: r.ok === true,
        fileName: typeof r.fileName === "string" ? r.fileName : undefined,
        truncated: r.truncated === true,
        error: typeof r.error === "string" ? r.error : undefined,
        nodes: Array.isArray(r.nodes)
            ? r.nodes.map(cleanAstNode).filter((n): n is AstNode => n !== null)
            : undefined,
    };
}

// ─── kind → syntax-ish tone ─────────────────────────────────────────

type Tone = "violet" | "amber" | "emerald" | "rose" | "teal" | "muted";

/** Coarse syntax bucket for a node kind — drives badge + legend color. */
function kindTone(kind: string): Tone {
    if (/^(AsyncFunctionDef|FunctionDef|Lambda)$/.test(kind)) return "violet";
    if (/^ClassDef$/.test(kind)) return "amber";
    if (/^(Call|Attribute|Name|Constant)$/.test(kind)) return "emerald";
    if (/^(If|While|For|AsyncFor|Try|With|AsyncWith|Match|IfExp)$/.test(kind)) return "rose";
    if (/^(Import|ImportFrom)$/.test(kind)) return "teal";
    return "muted";
}

const TONE_CLASSES: Record<Tone, string> = {
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300",
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-300",
    muted: "border-border bg-muted text-muted-foreground",
};

const TONE_DOT: Record<Tone, string> = {
    violet: "bg-violet-500/70",
    amber: "bg-amber-500/70",
    emerald: "bg-emerald-500/70",
    rose: "bg-rose-500/70",
    teal: "bg-teal-500/70",
    muted: "bg-muted-foreground/50",
};

/** "L12" for single-line nodes, "L12–L40" (en dash) for ranges. */
function spanLabel(node: AstNode): string {
    return node.line === node.endLine ? `L${node.line}` : `L${node.line}–L${node.endLine}`;
}

/** Cap on rendered tree rows — huge "Expand all" trees stay usable. */
const MAX_TREE_ROWS = 1500;

// ─── skeletons ──────────────────────────────────────────────────────

/** Tree-shaped shimmer: indented rows of badge + label bars. */
function TreeSkeleton() {
    const pattern = [0, 0, 1, 1, 2, 1, 0, 1, 2, 2, 1, 0, 1, 1, 2, 0, 1, 0];
    return (
        <div className="space-y-2.5 p-3" aria-hidden="true">
            {pattern.map((depth, i) => (
                <div key={i} className="flex items-center gap-2" style={{paddingLeft: depth * 14}}>
                    <Skeleton className="size-3 shrink-0 rounded-sm"/>
                    <Skeleton className="h-3.5 w-14 shrink-0"/>
                    <Skeleton className="h-3 flex-1" style={{maxWidth: `${52 + ((i * 31) % 44)}%`}}/>
                </div>
            ))}
        </div>
    );
}

/** Source-shaped shimmer: gutter number + varying text widths. */
function SourceSkeleton() {
    const widths = ["62%", "84%", "45%", "71%", "90%", "38%", "77%", "56%", "68%", "49%", "82%", "58%"];
    return (
        <div className="space-y-2 p-3" aria-hidden="true">
            {widths.map((w, i) => (
                <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-3 w-8 shrink-0"/>
                    <Skeleton className="h-3" style={{width: w}}/>
                </div>
            ))}
        </div>
    );
}

/** Centered padding state — shared by empty + error panes. */
function PaneMessage({icon, text, error}: { icon: React.ReactNode; text: string; error?: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center gap-1.5 py-12 px-8 text-center">
            <span className={cn("size-5", error ? "text-red-500/70" : "text-muted-foreground/50")}>{icon}</span>
            <p className={cn("text-xs", error ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{text}</p>
        </div>
    );
}

// ─── component ──────────────────────────────────────────────────────

export function AstExplorerPanel({
                                     open,
                                     onOpenChange,
                                     folderSlug,
                                     fileSlug,
                                     fileName,
                                     code,
                                 }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    /** Current editor buffer — sent to the API and rendered as the source pane. */
    code?: string;
}) {
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [data, setData] = React.useState<AstApiResult | null>(null);
    const [reloadNonce, setReloadNonce] = React.useState(0);
    const [kindFilter, setKindFilter] = React.useState("");
    const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
    const [selectedId, setSelectedId] = React.useState<string | null>(null);

    const treeRef = React.useRef<HTMLDivElement | null>(null);
    const sourceRef = React.useRef<HTMLDivElement | null>(null);

    // ── fetch (folder + file + optional live buffer) ──
    React.useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({folder: folderSlug, file: fileSlug});
        if (code !== undefined) qs.set("code", code);
        void (async () => {
            try {
                const res = await fetch(`/api/ast?${qs.toString()}`, {cache: "no-store"});
                const json: unknown = await res.json();
                if (cancelled) return;
                const parsed = parseAstResponse(json);
                if (!res.ok || !parsed || !parsed.ok || parsed.error) {
                    setError(parsed?.error ?? `HTTP ${res.status}`);
                    setData(null);
                } else {
                    setData(parsed);
                }
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, folderSlug, fileSlug, code, reloadNonce]);

    // Fresh open → reset transient state (selection, filter, collapse).
    React.useEffect(() => {
        if (open) {
            setSelectedId(null);
            setKindFilter("");
            setCollapsed(new Set());
        }
    }, [open]);

    // ── flatten with stable ids ──
    const flat = React.useMemo(() => {
        const out: FlatAst[] = [];
        const walk = (nodes: AstNode[], parentId: string | null, depth: number) => {
            for (const n of nodes) {
                const id = `${parentId ?? ""}/${n.kind}@${n.line}:${n.col}`;
                out.push({id, node: n, parentId, childCount: n.children.length, depth});
                walk(n.children, id, depth + 1);
            }
        };
        walk(data?.nodes ?? [], null, 0);
        return out;
    }, [data]);

    const byId = React.useMemo(() => new Map(flat.map((f) => [f.id, f])), [flat]);
    const flatByNode = React.useMemo(() => new Map(flat.map((f) => [f.node, f])), [flat]);

    // ── kind filter match info (self + subtree) ──
    const needle = kindFilter.trim().toLowerCase();
    const filterActive = needle.length > 0;
    const matchInfo = React.useMemo(() => {
        const info = new Map<string, { self: boolean; subtree: boolean }>();
        if (!filterActive) return info;
        const walk = (nodes: AstNode[]): boolean => {
            let any = false;
            for (const n of nodes) {
                const f = flatByNode.get(n);
                if (!f) continue;
                const self = n.kind.toLowerCase().includes(needle);
                const kids = walk(n.children);
                info.set(f.id, {self, subtree: self || kids});
                if (self || kids) any = true;
            }
            return any;
        };
        walk(data?.nodes ?? []);
        return info;
    }, [data, flatByNode, filterActive, needle]);

    const matchCount = React.useMemo(
        () => flat.filter((f) => matchInfo.get(f.id)?.self === true).length,
        [flat, matchInfo]
    );

    // ── visible rows (collapse state + filter) ──
    const rows = React.useMemo(() => {
        const out: Array<{ f: FlatAst; depth: number }> = [];
        const walkRows = (nodes: AstNode[], depth: number, ancestorHidden: boolean) => {
            for (const n of nodes) {
                const f = flatByNode.get(n);
                if (!f) continue;
                if (filterActive && matchInfo.get(f.id)?.subtree !== true) continue;
                if (ancestorHidden) continue;
                out.push({f, depth});
                // While filtering, collapse is ignored so every match is revealed.
                const hidden = filterActive ? ancestorHidden : ancestorHidden || collapsed.has(f.id);
                walkRows(n.children, depth + 1, hidden);
            }
        };
        walkRows(data?.nodes ?? [], 0, false);
        return out;
    }, [data, flatByNode, collapsed, filterActive, matchInfo]);

    const shownRows = rows.slice(0, MAX_TREE_ROWS);
    const selected = selectedId !== null ? (byId.get(selectedId) ?? null) : null;

    // Keep the selected node's source range in view.
    React.useEffect(() => {
        if (!selected) return;
        sourceRef.current
            ?.querySelector(`[data-l="${selected.node.line}"]`)
            ?.scrollIntoView({block: "center", behavior: "smooth"});
    }, [selected]);

    /** Deepest node containing lineNo — greatest depth, tightest span wins. */
    const findDeepestContaining = (lineNo: number): FlatAst | null => {
        let best: FlatAst | null = null;
        let bestScore = -1;
        for (const f of flat) {
            const n = f.node;
            if (lineNo >= n.line && lineNo <= n.endLine) {
                const score = f.depth * 1_000_000 - (n.endLine - n.line);
                if (score > bestScore) {
                    bestScore = score;
                    best = f;
                }
            }
        }
        return best;
    };

    /** Click a source line → select + reveal the deepest covering node. */
    const onSourceLineClick = (lineNo: number) => {
        const deepest = findDeepestContaining(lineNo);
        if (!deepest) return;
        setCollapsed((prev) => {
            const next = new Set(prev);
            let p: string | null = deepest.parentId;
            while (p !== null) {
                next.delete(p);
                p = byId.get(p)?.parentId ?? null;
            }
            return next;
        });
        setSelectedId(deepest.id);
        requestAnimationFrame(() => {
            treeRef.current
                ?.querySelector(`[data-node-id="${deepest.id}"]`)
                ?.scrollIntoView({block: "nearest", behavior: "smooth"});
        });
    };

    const expandAll = () => setCollapsed(new Set());
    const collapseAll = () => setCollapsed(new Set(flat.filter((f) => f.childCount > 0).map((f) => f.id)));

    const sourceLines = React.useMemo(() => (code !== undefined ? code.split("\n") : []), [code]);
    const attrEntries = selected ? Object.entries(selected.node.attrs) : [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ListTree className="size-4 text-violet-500"/>
                        AST explorer — {fileName}
                    </DialogTitle>
                    <DialogDescription>
                        Python syntax tree synced with the source: click a node to highlight its range, click a line to
                        jump to the deepest node covering it.
                    </DialogDescription>
                </DialogHeader>

                {/* toolbar — kind filter + counts + expand/collapse + refresh */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <Input
                        value={kindFilter}
                        onChange={(e) => setKindFilter(e.target.value)}
                        placeholder="Filter kinds — e.g. Call"
                        aria-label="Filter AST nodes by kind"
                        className="h-8 text-xs flex-1 min-w-36 font-mono"
                        spellCheck={false}
                    />
                    {filterActive && (
                        <Badge variant="secondary" className="text-[10px] shrink-0"
                               title="Nodes whose kind matches the filter">
                            {matchCount} / {flat.length} nodes
                        </Badge>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1 shrink-0"
                        onClick={expandAll}
                        disabled={flat.length === 0}
                        title="Expand every tree node"
                    >
                        <ChevronsUpDown className="size-3.5"/> Expand all
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1 shrink-0"
                        onClick={collapseAll}
                        disabled={flat.length === 0}
                        title="Collapse every branch"
                    >
                        <ChevronsDownUp className="size-3.5"/> Collapse all
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1 shrink-0"
                        onClick={() => setReloadNonce((n) => n + 1)}
                        disabled={loading}
                        title="Re-parse the file"
                        aria-label="Refresh the AST"
                    >
                        <RefreshCw className="size-3.5"/>
                    </Button>
                </div>

                {data?.truncated === true && (
                    <div
                        className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="size-3.5 shrink-0"/>
                        The AST was truncated (very large file) — deep subtrees may be missing.
                    </div>
                )}

                {/* body — tree rail + source pane */}
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(240px,290px)_1fr] gap-3 flex-1 min-h-0">
                    {/* tree rail */}
                    <div className="rounded-md border flex flex-col min-h-0 overflow-hidden">
                        <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-1.5 shrink-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nodes</p>
                            <span
                                className="ml-auto text-[10px] text-muted-foreground tabular-nums">{flat.length}</span>
                        </div>
                        <div
                            ref={treeRef}
                            role="tree"
                            aria-label="Python AST node tree"
                            aria-busy={loading}
                            className="flex-1 min-h-0 overflow-y-auto max-h-[46vh] py-2"
                        >
                            {loading ? (
                                <TreeSkeleton/>
                            ) : error ? (
                                <PaneMessage icon={<AlertTriangle className="size-5"/>} text={error} error/>
                            ) : flat.length === 0 ? (
                                <PaneMessage icon={<CircleSlash className="size-5"/>}
                                             text="No AST nodes — the file may be empty or not Python."/>
                            ) : shownRows.length === 0 ? (
                                <PaneMessage icon={<CircleSlash className="size-5"/>}
                                             text={`No kind matches “${kindFilter.trim()}”.`}/>
                            ) : (
                                <>
                                    {shownRows.map(({f, depth}) => {
                                        const n = f.node;
                                        const isCollapsed = collapsed.has(f.id);
                                        const info = matchInfo.get(f.id);
                                        const isSel = f.id === selectedId;
                                        return (
                                            <div
                                                key={f.id}
                                                role="treeitem"
                                                aria-level={depth + 1}
                                                aria-selected={isSel}
                                                aria-expanded={f.childCount > 0 ? !isCollapsed : undefined}
                                                data-node-id={f.id}
                                                className={cn(
                                                    "flex items-center gap-1.5 pr-2 py-1 cursor-pointer hover:bg-muted/50",
                                                    isSel && "bg-emerald-500/15",
                                                    filterActive && info?.self === true && !isSel && "bg-violet-500/10",
                                                    filterActive && info?.self !== true && "opacity-60"
                                                )}
                                                style={{paddingLeft: `${depth * 14 + 8}px`}}
                                            >
                                                {f.childCount > 0 ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setCollapsed((prev) => {
                                                                const next = new Set(prev);
                                                                if (next.has(f.id)) next.delete(f.id);
                                                                else next.add(f.id);
                                                                return next;
                                                            });
                                                        }}
                                                        aria-label={isCollapsed ? `Expand ${n.kind} ${n.label}` : `Collapse ${n.kind} ${n.label}`}
                                                        className="shrink-0 text-muted-foreground hover:text-foreground"
                                                    >
                                                        {isCollapsed ? (
                                                            <ChevronRight className="size-3"/>
                                                        ) : (
                                                            <ChevronDown className="size-3"/>
                                                        )}
                                                    </button>
                                                ) : (
                                                    <span className="w-3 shrink-0" aria-hidden="true"/>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedId(f.id)}
                                                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                                                    title={
                                                        attrEntriesFor(n).length > 0
                                                            ? attrEntriesFor(n).map(([k, v]) => `${k}: ${v}`).join("  ·  ")
                                                            : `${n.kind} — ${spanLabel(n)}`
                                                    }
                                                >
                          <span
                              className={cn(
                                  "shrink-0 rounded border px-1 py-px font-mono text-[9px] font-medium leading-none",
                                  TONE_CLASSES[kindTone(n.kind)]
                              )}
                          >
                            {n.kind}
                          </span>
                                                    <span className="truncate font-mono text-xs">{n.label}</span>
                                                    <span
                                                        className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {spanLabel(n)}
                          </span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {rows.length > MAX_TREE_ROWS && (
                                        <p className="px-3 pt-2 text-[10px] italic text-muted-foreground">
                                            Showing the first {MAX_TREE_ROWS} of {rows.length} rows — narrow the filter
                                            or collapse branches.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* source pane */}
                    <div className="rounded-md border flex flex-col min-h-0 overflow-hidden">
                        <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-1.5 shrink-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Source</p>
                            {selected && (
                                <span className="ml-auto text-[10px] font-mono text-emerald-600 dark:text-emerald-300">
                  {selected.node.kind} {spanLabel(selected.node)}
                </span>
                            )}
                        </div>
                        <div
                            ref={sourceRef}
                            aria-busy={loading}
                            aria-label="File source with the selected node's range highlighted"
                            className="flex-1 min-h-0 overflow-auto max-h-[46vh] font-mono text-xs py-2"
                        >
                            {loading ? (
                                <SourceSkeleton/>
                            ) : code === undefined ? (
                                <PaneMessage
                                    icon={<CircleSlash className="size-5"/>}
                                    text="No editor buffer — open the file to highlight node ranges against its source."
                                />
                            ) : sourceLines.length === 0 ? (
                                <PaneMessage icon={<CircleSlash className="size-5"/>} text="The buffer is empty."/>
                            ) : (
                                sourceLines.map((text, i) => {
                                    const lineNo = i + 1;
                                    const inRange =
                                        selected !== null && lineNo >= selected.node.line && lineNo <= selected.node.endLine;
                                    return (
                                        <button
                                            key={lineNo}
                                            type="button"
                                            data-l={lineNo}
                                            onClick={() => onSourceLineClick(lineNo)}
                                            aria-label={`Source line ${lineNo}`}
                                            title={`Line ${lineNo} — click to select the deepest node covering it`}
                                            className={cn(
                                                "flex w-full items-start gap-2 px-2 py-0.5 text-left hover:bg-muted/50",
                                                inRange && "bg-emerald-500/20"
                                            )}
                                        >
                      <span className="w-9 shrink-0 select-none text-right tabular-nums text-muted-foreground">
                        {lineNo}
                      </span>
                                            <span
                                                className="min-w-0 flex-1 whitespace-pre-wrap break-all">{text.length > 0 ? text : " "}</span>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* selected node attributes */}
                {selected && attrEntries.length > 0 && (
                    <div className="rounded-md border bg-muted/20 px-3 py-2">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {selected.node.kind} attributes
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {attrEntries.map(([k, v]) => (
                                <span key={k} className="font-mono text-[11px]">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="mx-1 text-muted-foreground/60">=</span>
                  <span className="text-foreground">{v}</span>
                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* legend */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className={cn("size-2 rounded-sm", TONE_DOT.violet)}/> def / lambda
          </span>
                    <span className="inline-flex items-center gap-1">
            <span className={cn("size-2 rounded-sm", TONE_DOT.amber)}/> class
          </span>
                    <span className="inline-flex items-center gap-1">
            <span className={cn("size-2 rounded-sm", TONE_DOT.emerald)}/> call / name
          </span>
                    <span className="inline-flex items-center gap-1">
            <span className={cn("size-2 rounded-sm", TONE_DOT.rose)}/> control flow
          </span>
                    <span className="inline-flex items-center gap-1">
            <span className={cn("size-2 rounded-sm", TONE_DOT.teal)}/> import
          </span>
                    <span className="ml-auto hidden sm:inline">Chevrons toggle branches; the filter ignores collapse state.</span>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Attr entries helper — kept out of the row render for clarity. */
function attrEntriesFor(node: AstNode): Array<[string, string]> {
    return Object.entries(node.attrs);
}
