"use client";

import * as React from "react";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import {BookOpen, Clock, CornerDownLeft, FileCode2, FileSearch, Loader2, Play,} from "lucide-react";
import {cn} from "@/lib/utils";
import {STORAGE_PREFIX} from "@/lib/config";

interface SearchFolder {
    name: string;
    slug: string;
    files: { name: string; slug: string }[];
}

interface SearchDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folders: SearchFolder[];
    /** Called when the user picks a script (run action = false). */
    onSelect: (folderSlug: string, fileSlug: string) => void;
    /** Called when the user picks "Run" via Enter on a script row. */
    onRun?: (folderSlug: string, fileSlug: string) => void;
    /** Default to full-text search mode (from settings). */
    fullTextByDefault?: boolean;
    /** The currently selected folder slug — used by the "Run current
     * script" action so it runs the ACTUAL current script, not
     * flatScripts[0]. */
    currentFolderSlug?: string;
    /** The currently selected file slug — same as above. */
    currentFileSlug?: string;
}

interface FtsHit {
    folder: string;
    folderSlug: string;
    file: string;
    fileSlug: string;
    line: number;
    snippet: string;
}

/**
 * A cmdk-powered fuzzy search dialog over all folders and scripts.
 * Opens with Ctrl/Cmd+K. Type to filter by folder name, file name,
 * or both — select a row to navigate, or press Enter on a script row
 * to navigate + run.
 *
 * Includes a toggle (top-right of the input) to switch between
 * "name search" (default) and "full-text search" (searches inside
 * file contents via /api/full-text-search).
 */
export function SearchDialog({
                                 open,
                                 onOpenChange,
                                 folders,
                                 onSelect,
                                 onRun,
                                 fullTextByDefault,
                                 currentFolderSlug,
                                 currentFileSlug,
                             }: SearchDialogProps) {
    // Always start with false to avoid SSR/client hydration mismatch.
    // The actual default is applied in the useEffect below after mount.
    const [fullTextMode, setFullTextMode] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [ftsHits, setFtsHits] = React.useState<FtsHit[]>([]);
    const [ftsLoading, setFtsLoading] = React.useState(false);

    // Sync from settings after mount + when dialog opens.
    React.useEffect(() => {
        if (open) {
            setFullTextMode(!!fullTextByDefault);
            setQuery("");
            setFtsHits([]);
        }
    }, [open, fullTextByDefault]);

    // Debounced full-text search.
    // the debounce cleanup used to only set a
    // `cancelled` flag — the in-flight /api/full-text-search requests
    // themselves kept running and piled up on every keystroke (each one
    // re-reads the whole corpus server-side). They are now aborted with a
    // real AbortController.
    const ftsAbortRef = React.useRef<AbortController | null>(null);
    React.useEffect(() => {
        if (!open || !fullTextMode || !query.trim()) {
            ftsAbortRef.current?.abort();
            ftsAbortRef.current = null;
            setFtsHits([]);
            return;
        }
        let cancelled = false;
        setFtsLoading(true);
        const t = setTimeout(async () => {
            ftsAbortRef.current?.abort();
            const controller = new AbortController();
            ftsAbortRef.current = controller;
            try {
                const res = await fetch(
                    `/api/full-text-search?q=${encodeURIComponent(query.trim())}&limit=50`,
                    {signal: controller.signal}
                );
                const data = await res.json();
                if (!cancelled) {
                    setFtsHits(data.hits ?? []);
                }
            } catch (err) {
                if (
                    !cancelled &&
                    !(err instanceof DOMException && err.name === "AbortError")
                ) {
                    setFtsHits([]);
                }
            } finally {
                if (!cancelled) setFtsLoading(false);
            }
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(t);
            ftsAbortRef.current?.abort();
            ftsAbortRef.current = null;
        };
    }, [query, fullTextMode, open]);

    const flatScripts = React.useMemo(() => {
        const list: {
            folderName: string;
            folderSlug: string;
            fileName: string;
            fileSlug: string;
        }[] = [];
        for (const c of folders) {
            for (const f of c.files) {
                list.push({
                    folderName: c.name,
                    folderSlug: c.slug,
                    fileName: f.name,
                    fileSlug: f.slug,
                });
            }
        }
        return list;
    }, [folders]);

    return (
        <CommandDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Search scripts"
            description={
                fullTextMode
                    ? "Searching inside file contents. Toggle off for name-only search."
                    : "Find a folder or script by name. Toggle on for full-text search."
            }
            className="sm:max-w-xl"
            // Disable cmdk's built-in filter when in FTS mode — the server
            // already filtered the results, and cmdk's filter would hide
            // hits whose text doesn't contain the query (e.g. a hit on a
            // line that doesn't include the search term verbatim). In name
            // mode we keep cmdk's filter for snappy client-side fuzzy match.
            shouldFilter={!fullTextMode}
            // no X close button — VS Code-style quick input. The
            // dialog used to show TWO icons stacked at the top-right (the X
            // from DialogContent + the FileSearch mode toggle inside the
            // input row), which read as a duplicated close affordance.
            // Esc and clicking outside still close it.
            showCloseButton={false}
        >
            <div className="relative">
                <CommandInput
                    placeholder={
                        fullTextMode
                            ? "Search inside file contents…"
                            : "Search folders and scripts…"
                    }
                    onValueChange={setQuery}
                />
                <button
                    onClick={() => setFullTextMode((v) => !v)}
                    className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-md flex items-center justify-center text-xs",
                        fullTextMode
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    )}
                    title={
                        fullTextMode
                            ? "Full-text search ON — click for name-only"
                            : "Name search — click for full-text search"
                    }
                >
                    <FileSearch className="size-3.5"/>
                </button>
            </div>

            <CommandList className="max-h-[60vh]">
                <CommandEmpty>
                    {fullTextMode && ftsLoading ? "Searching…" : "No matches."}
                </CommandEmpty>

                {fullTextMode ? (
                    // Full-text search results — rendered as real CommandItems so
                    // cmdk's keyboard navigation (↑/↓/Enter) works. The Command's
                    // shouldFilter is false in FTS mode (set on CommandDialog
                    // above) so cmdk won't hide the server-filtered hits.
                    <div className="p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 px-2">
                            Content matches {ftsHits.length > 0 && `(${ftsHits.length})`}
                        </p>
                        {ftsLoading && (
                            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                                <Loader2 className="size-3 animate-spin"/>
                                Searching…
                            </div>
                        )}
                        {!ftsLoading && ftsHits.length === 0 && query.trim() && (
                            <div
                                className="px-3 py-2 text-xs text-muted-foreground"
                                role="status"
                                aria-live="polite"
                            >
                                No content matches for &ldquo;{query}&rdquo;.
                            </div>
                        )}
                        {!ftsLoading && !query.trim() && (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                                Type to search inside file contents…
                            </div>
                        )}
                        {ftsHits.map((hit, i) => (
                            <CommandItem
                                key={`${hit.folderSlug}/${hit.fileSlug}/${hit.line}/${i}`}
                                value={`${hit.file} ${hit.folder} L${hit.line} ${hit.snippet}`}
                                onSelect={() => {
                                    onSelect(hit.folderSlug, hit.fileSlug);
                                    onOpenChange(false);
                                }}
                                className="flex items-start gap-2 cursor-pointer"
                            >
                                <FileSearch className="size-4 text-emerald-500 shrink-0 mt-0.5"/>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {hit.file}
                    </span>
                                        <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                      L{hit.line}
                    </span>
                                    </div>
                                    <pre className="text-[10px] text-muted-foreground truncate font-mono mt-0.5">
                    {hit.snippet.split("\n").filter(Boolean).slice(0, 2).join(" · ")}
                  </pre>
                                    <span className="text-[10px] text-muted-foreground truncate">
                    {hit.folder}
                  </span>
                                </div>
                            </CommandItem>
                        ))}
                    </div>
                ) : (
                    <>
                        {/* Recently opened scripts */}
                        <RecentScripts
                            folders={folders}
                            open={open}
                            onSelect={(c, f) => {
                                onSelect(c, f);
                                onOpenChange(false);
                            }}
                        />
                        {/* Folders group */}
                        <CommandGroup heading="Folders">
                            {folders.map((c) => (
                                <CommandItem
                                    key={c.slug}
                                    value={`${c.name} folder`}
                                    onSelect={() => {
                                        onSelect(c.slug, c.files[0]?.slug ?? "");
                                        onOpenChange(false);
                                    }}
                                >
                                    <BookOpen className="size-4 text-muted-foreground"/>
                                    <span className="flex-1 truncate">{c.name}</span>
                                    <span className="text-xs text-muted-foreground">
                    {c.files.length} script{c.files.length === 1 ? "" : "s"}
                  </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>

                        <CommandSeparator/>

                        {/* Scripts group */}
                        <CommandGroup heading="Scripts">
                            {flatScripts.map((s) => (
                                <CommandItem
                                    key={`${s.folderSlug}/${s.fileSlug}`}
                                    value={`${s.fileName} ${s.folderName}`}
                                    onSelect={() => {
                                        onSelect(s.folderSlug, s.fileSlug);
                                        onOpenChange(false);
                                    }}
                                >
                                    <FileCode2 className="size-4 text-muted-foreground"/>
                                    <span className="flex-1 truncate">{s.fileName}</span>
                                    <span className="text-xs text-muted-foreground truncate ml-2">
                    {s.folderName}
                  </span>
                                    {onRun && (
                                        <span
                                            className="ml-2 hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground">
                      <CornerDownLeft className="size-3"/> open
                    </span>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </>
                )}

                {onRun && !fullTextMode && currentFolderSlug && currentFileSlug && (
                    <>
                        <CommandSeparator/>
                        <CommandGroup heading="Actions">
                            <CommandItem
                                value="run current script"
                                onSelect={() => {
                                    // Run the ACTUAL currently-selected script, not
                                    // flatScripts[0] (which is just the alphabetically-
                                    // first script in the folder list).
                                    onRun(currentFolderSlug, currentFileSlug);
                                    onOpenChange(false);
                                }}
                            >
                                <Play className="size-4 text-emerald-500"/>
                                <span className="flex-1">Run Current Script</span>
                                <kbd className="text-[10px] text-muted-foreground">
                                    Ctrl+Enter
                                </kbd>
                            </CommandItem>
                        </CommandGroup>
                    </>
                )}
            </CommandList>
        </CommandDialog>
    );
}

/* ------------------------------------------------------------------ */
/*  Recent scripts — last 5 opened scripts, stored in localStorage    */
/* ------------------------------------------------------------------ */
const RECENT_KEY = `${STORAGE_PREFIX}.recent-scripts`;
const MAX_RECENT = 5;

interface RecentEntry {
    folderSlug: string;
    fileSlug: string;
    folderName: string;
    fileName: string;
    openedAt: number;
}

function loadRecent(): RecentEntry[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(RECENT_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as RecentEntry[];
    } catch {
        return [];
    }
}

function saveRecent(entries: RecentEntry[]) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            RECENT_KEY,
            JSON.stringify(entries.slice(0, MAX_RECENT))
        );
    } catch { /* ignore */
    }
}

/** Track a script as recently opened. Call when a script is selected. */
export function trackRecentScript(
    folderSlug: string,
    fileSlug: string,
    folderName: string,
    fileName: string
) {
    const recent = loadRecent().filter(
        (e) => !(e.folderSlug === folderSlug && e.fileSlug === fileSlug)
    );
    recent.unshift({folderSlug, fileSlug, folderName, fileName, openedAt: Date.now()});
    saveRecent(recent);
}

function RecentScripts({
                           folders,
                           onSelect,
                           open,
                       }: {
    folders: SearchFolder[];
    onSelect: (folderSlug: string, fileSlug: string) => void;
    /** Re-load recents every time the dialog opens so the list reflects
     * scripts the user just opened (a load-once mount effect would stay
     * stale for the lifetime of the dialog). */
    open: boolean;
}) {
    const [recent, setRecent] = React.useState<RecentEntry[]>([]);

    React.useEffect(() => {
        setRecent(loadRecent());
    }, [open]);

    if (recent.length === 0) return null;

    // Filter to only show entries that still exist in the current folder tree.
    const valid = recent.filter((r) =>
        folders.some(
            (c) => c.slug === r.folderSlug && c.files.some((f) => f.slug === r.fileSlug)
        )
    );

    if (valid.length === 0) return null;

    return (
        <CommandGroup heading="Recently opened">
            {valid.map((r, i) => (
                <CommandItem
                    key={`${r.folderSlug}/${r.fileSlug}/${i}`}
                    value={`${r.fileName} ${r.folderName} recent`}
                    onSelect={() => onSelect(r.folderSlug, r.fileSlug)}
                >
                    <Clock className="size-4 text-muted-foreground"/>
                    <span className="flex-1 truncate">{r.fileName}</span>
                    <span className="text-xs text-muted-foreground truncate ml-2">
            {r.folderName}
          </span>
                </CommandItem>
            ))}
        </CommandGroup>
    );
}
