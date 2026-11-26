"use client";

import * as React from "react";
import {Button} from "@/components/ui/button";
import {BookOpen, ChevronDown, ChevronRight, FileCode2, FileText, ListTodo, Loader2, RefreshCw,} from "lucide-react";
import {cn} from "@/lib/utils";

export interface TodoEntry {
    folder: string;
    folderName: string;
    file: string;
    fileSlug: string;
    line: number;
    tag: string;
    text: string;
    /** The file's FileKind string ("python" | "java" | "c" | "markdown" | …) —
     *  the scan covers every text kind now, not just py/md/txt. */
    kind: string;
}

interface TodoPanelProps {
    /** Open the file at a line (folder slug, file slug, 1-indexed line). */
    onOpenFile: (folderSlug: string, fileSlug: string, line: number) => void;
    /** Bump to force a re-scan (e.g. after a save). */
    refreshNonce?: number;
    /** Auto-rescan when this flips true (panel becomes visible). */
    active: boolean;
}

const TAG_COLOR: Record<string, string> = {
    TODO: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    FIXME: "bg-red-500/15 text-red-600 dark:text-red-400",
    XXX: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    HACK: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
};

/**
 * TODO / FIXME / XXX / HACK panel — scans every folder via
 * /api/todos and lists each occurrence with file + line. Rows jump to
 * the exact line; folders start collapsed except the first one with
 * hits. Re-scans on mount, on the refresh button, and whenever a save
 * bumps `refreshNonce`.
 */
export function TodoPanel({onOpenFile, refreshNonce = 0, active}: TodoPanelProps) {
    const [todos, setTodos] = React.useState<TodoEntry[] | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
    const [filter, setFilter] = React.useState<string>("all");
    const lastNonceRef = React.useRef(refreshNonce);

    const scan = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/todos");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setTodos(data.todos ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setTodos([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial + activation scan.
    React.useEffect(() => {
        if (active && todos === null && !loading) void scan();
    }, [active, todos, loading, scan]);

    // Re-scan when the parent bumps the nonce (post-save).
    React.useEffect(() => {
        if (refreshNonce !== lastNonceRef.current) {
            lastNonceRef.current = refreshNonce;
            void scan();
        }
    }, [refreshNonce, scan]);

    const byFolder = React.useMemo(() => {
        const map = new Map<string, TodoEntry[]>();
        for (const t of todos ?? []) {
            const arr = map.get(t.folder) ?? [];
            arr.push(t);
            map.set(t.folder, arr);
        }
        return [...map.entries()];
    }, [todos]);

    const filtered = React.useMemo(
        () =>
            byFolder
                .map(([slug, entries]) => [
                    slug,
                    filter === "all" ? entries : entries.filter((t) => t.tag === filter),
                ] as [string, TodoEntry[]])
                .filter(([, entries]) => entries.length > 0),
        [byFolder, filter]
    );

    const tagCounts = React.useMemo(() => {
        const counts: Record<string, number> = {TODO: 0, FIXME: 0, XXX: 0, HACK: 0};
        for (const t of todos ?? []) counts[t.tag] = (counts[t.tag] ?? 0) + 1;
        return counts;
    }, [todos]);

    const toggle = (slug: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(slug)) next.delete(slug);
            else next.add(slug);
            return next;
        });
    };

    return (
        <div className="h-full flex flex-col overflow-hidden" data-tutorial="todo-panel">
            {/* Toolbar */}
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-muted/30 shrink-0 flex-wrap">
                <ListTodo className="size-3.5 text-muted-foreground"/>
                <span className="text-xs font-medium">TODOs</span>
                {todos && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
            {todos.length} marker{todos.length === 1 ? "" : "s"}
          </span>
                )}
                <div className="flex-1"/>
                {(["all", "TODO", "FIXME", "XXX", "HACK"] as const).map((tag) => (
                    <button
                        key={tag}
                        onClick={() => setFilter(tag)}
                        className={cn(
                            "h-6 px-2 rounded-md text-[10px] font-medium transition-colors",
                            filter === tag
                                ? "bg-primary/15 text-primary"
                                : "text-muted-foreground hover:bg-muted"
                        )}
                        title={
                            tag === "all"
                                ? "All markers"
                                : `Only ${tag}${tagCounts[tag] ? ` (${tagCounts[tag]})` : ""}`
                        }
                    >
                        {tag === "all" ? "All" : tag}
                        {tag !== "all" && tagCounts[tag] > 0 && ` ${tagCounts[tag]}`}
                    </button>
                ))}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void scan()}
                    className="h-6 px-2 gap-1 text-[10px]"
                    title="Re-scan every folder for TODO / FIXME / XXX / HACK"
                >
                    {loading ? (
                        <Loader2 className="size-3 animate-spin"/>
                    ) : (
                        <RefreshCw className="size-3"/>
                    )}
                    Rescan
                </Button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto text-xs">
                {error && (
                    <p className="px-3 py-2 text-red-600 dark:text-red-400">{error}</p>
                )}
                {!error && todos === null && loading && (
                    <div className="flex items-center gap-2 px-3 py-3 text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin"/> Scanning folders…
                    </div>
                )}
                {!error && todos !== null && todos.length === 0 && !loading && (
                    <div className="flex flex-col items-center gap-1.5 px-3 py-8 text-muted-foreground">
                        <ListTodo className="size-6 opacity-40"/>
                        <p className="text-xs">No TODO / FIXME / XXX / HACK markers found.</p>
                        <p className="text-[10px]">
                            Add a comment like <code className="font-mono"># TODO: verify the CI bound</code>{" "}
                            and rescan.
                        </p>
                    </div>
                )}
                {filtered.map(([slug, entries]) => {
                    const isCollapsed = collapsed.has(slug);
                    return (
                        <div key={slug} className="border-b last:border-b-0">
                            <button
                                onClick={() => toggle(slug)}
                                className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-muted/40 text-left"
                            >
                                {isCollapsed ? (
                                    <ChevronRight className="size-3.5 text-muted-foreground shrink-0"/>
                                ) : (
                                    <ChevronDown className="size-3.5 text-muted-foreground shrink-0"/>
                                )}
                                <BookOpen className="size-3.5 text-muted-foreground shrink-0"/>
                                <span className="font-medium truncate">{entries[0].folderName}</span>
                                <span className="text-[10px] text-muted-foreground tabular-nums ml-auto shrink-0">
                  {entries.length}
                </span>
                            </button>
                            {!isCollapsed &&
                                entries.map((t, i) => (
                                    <button
                                        key={`${t.folder}/${t.fileSlug}/${t.line}/${i}`}
                                        onClick={() => onOpenFile(t.folder, t.fileSlug, t.line)}
                                        className="w-full flex items-start gap-2 pl-7 pr-2 py-1.5 hover:bg-muted/40 text-left"
                                        title={`${t.folderName} › ${t.file} — line ${t.line}`}
                                    >
                                        {t.kind !== "markdown" && t.kind !== "text" && t.kind !== "log" ? (
                                            <FileCode2 className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                        ) : (
                                            <FileText className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                        )}
                                        <span
                                            className={cn(
                                                "shrink-0 rounded px-1 py-px text-[9px] font-semibold font-mono mt-0.5",
                                                TAG_COLOR[t.tag] ?? "bg-muted text-muted-foreground"
                                            )}
                                        >
                      {t.tag}
                    </span>
                                        <div className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11px]">
                        {t.text || <em className="text-muted-foreground not-italic">(no description)</em>}
                      </span>
                                            <span className="block text-[10px] text-muted-foreground truncate">
                        {t.file} : {t.line}
                      </span>
                                        </div>
                                    </button>
                                ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
