"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {Checkbox} from "@/components/ui/checkbox";
import {ScrollArea} from "@/components/ui/scroll-area";
import {
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    CircleAlert,
    CornerDownLeft,
    FileSearch,
    Loader2,
    Regex as RegexIcon,
    Replace as ReplaceIcon,
    ReplaceAll,
    Search,
} from "lucide-react";
import {useToast} from "@/hooks/use-toast";
import {FileDiffPreview} from "@/components/file-diff-preview";
import {decodeSlug} from "@/lib/slug-codec";
import {armMultiFileUndoHotkey} from "@/lib/multi-file-undo-hotkey";
import {type MultiFileUndoEntry, pushMultiFileUndoGroup} from "@/lib/multi-file-undo";
import {cn} from "@/lib/utils";

/* ================================================================== */
/*  Types                                                              */

/* ================================================================== */

interface FtsHit {
    folder: string;
    folderSlug: string;
    file: string;
    fileSlug: string;
    line: number;
    snippet: string;
}

interface FolderLike {
    name: string;
    slug: string;
}

interface ProjectSearchDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /**
     * Project folders — currently used for API compatibility (the FTS
     * endpoint enumerates files itself, so the dialog doesn't strictly
     * need them), but reserved for future filtering / scope refinement.
     */
    folders: FolderLike[];
    /** Called with (folderSlug, fileSlug, line) when a result is clicked. */
    onJumpTo: (folderSlug: string, fileSlug: string, line: number) => void;
}

/** One checked result row as it survives into the review pane. */
interface ReviewRow {
    hit: FtsHit;
    /**
     * True when the line no longer contains the query at review time
     * (file changed since the search, or the line moved) — stale rows
     * are NEVER written and are surfaced as such in the diff pane.
     */
    stale: boolean;
    /** How many replacements this row contributes to the new content. */
    count: number;
}

/** One affected file inside the review pane. */
interface ReviewFile {
    folder: string;
    folderSlug: string;
    file: string;
    fileSlug: string;
    /** Decoded RELATIVE path (forward slashes) — what /api/file-write
     *  expects; the display `file` is only the basename, which would
     *  write nested files to the folder ROOT. */
    fileName: string;
    /** The file's content as fetched at review time (pre-replacement). */
    original: string;
    /** The content with ONLY this file's checked rows replaced. */
    newContent: string;
    /** Only the CHECKED rows of this file (unchecked rows never reach
     *  the review, so they are never written). */
    rows: ReviewRow[];
    /** Total replacements folded into newContent. */
    replacedCount: number;
    /** Set when the file could not be read for the preview. */
    fetchError?: string;
}

interface ReviewState {
    loading: boolean;
    files: ReviewFile[];
    /** Per-file include checkboxes (default: every writable file). */
    includedKeys: Set<string>;
}

/* ================================================================== */
/*  Helpers: keys, fetch pool, replacement                             */

/* ================================================================== */

/** Identity of one result row: file slugs + the line (one FTS hit
 *  per line, so the line is unique within a file). */
function hitKey(h: FtsHit): string {
    return `${h.folderSlug}/${h.fileSlug}#${h.line}`;
}

function fileKeyOf(f: { folderSlug: string; fileSlug: string }): string {
    return `${f.folderSlug}/${f.fileSlug}`;
}

/** Read one file's text through the generic /api/file route (works for
 *  every text kind — /api/code is .py-only). Returns null on failure. */
async function fetchFileText(folderSlug: string, fileSlug: string): Promise<string | null> {
    try {
        const res = await fetch(
            `/api/file?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`
        );
        if (!res.ok) return null;
        return await res.text();
    } catch {
        return null;
    }
}

/**
 * Bounded-concurrency map — fetching every affected file SEQUENTIALLY
 * makes a 50-file review feel sluggish, while Promise.all(50) stampedes
 * the dev server. A 4-wide pool keeps the review build interactive
 * without a request flood.
 */
async function mapPool<T, R>(items: readonly T[], fn: (t: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    const width = Math.min(4, Math.max(1, items.length));
    const workers = Array.from({length: width}, async () => {
        for (; ;) {
            const i = next++;
            if (i >= items.length) break;
            out[i] = await fn(items[i]);
        }
    });
    await Promise.all(workers);
    return out;
}

/**
 * Apply the find/replace to a content string. Returns the new content
 * and the number of replacements made.
 *
 * - Literal mode: case-insensitive substring replace (matches the FTS
 * endpoint's case-insensitive matching).
 * - Regex mode: uses `new RegExp(find, "g")` — the pattern is the
 * user's raw input; capture groups and meta are honored.
 */
function applyReplacement(
    content: string,
    find: string,
    replace: string,
    useRegex: boolean,
): { newContent: string; count: number } {
    if (!find) return {newContent: content, count: 0};
    if (useRegex) {
        let re: RegExp;
        try {
            re = new RegExp(find, "g");
        } catch {
            return {newContent: content, count: 0};
        }
        let count = 0;
        const newContent = content.replace(re, (m) => {
            if (m.length > 0) count++;
            return replace;
        });
        return {newContent, count};
    }
    // Literal, case-insensitive. We can't use String.replaceAll with a
    // string needle + case-insensitivity, so split the content by the
    // lowercased needle and rebuild.
    const lower = content.toLowerCase();
    const needle = find.toLowerCase();
    if (!needle) return {newContent: content, count: 0};
    let count = 0;
    let idx = 0;
    let out = "";
    while (true) {
        const pos = lower.indexOf(needle, idx);
        if (pos === -1) {
            out += content.slice(idx);
            break;
        }
        out += content.slice(idx, pos) + replace;
        idx = pos + needle.length;
        count++;
    }
    return {newContent: out, count};
}

/**
 * Split a source line into <span>/<mark> fragments so the matched
 * portion(s) are visually highlighted.
 *
 * - Literal mode: case-insensitive substring match.
 * - Regex mode: applies the pattern globally.
 */
function highlightLine(
    line: string,
    find: string,
    useRegex: boolean,
): React.ReactNode[] {
    if (!find) return [line];
    let re: RegExp;
    try {
        if (useRegex) {
            re = new RegExp(find, "g");
        } else {
            const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            re = new RegExp(escaped, "gi");
        }
    } catch {
        return [line];
    }
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let key = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        if (m.index > lastIdx) {
            parts.push(
                <span key={key++}>{line.slice(lastIdx, m.index)}</span>,
            );
        }
        parts.push(
            <mark
                key={key++}
                className="bg-yellow-300/80 dark:bg-yellow-500/40 text-foreground rounded px-0"
            >
                {m[0]}
            </mark>,
        );
        lastIdx = m.index + m[0].length;
        if (m[0].length === 0) {
            // Avoid an infinite loop on zero-length matches.
            re.lastIndex++;
        }
    }
    if (lastIdx < line.length) {
        parts.push(<span key={key++}>{line.slice(lastIdx)}</span>);
    }
    return parts;
}

/* ================================================================== */
/*  Top-level dialog                                                   */

/* ================================================================== */

/**
 * Project-wide Find & Replace dialog — searches every `.py` file across
 * all folders via `/api/full-text-search`, lists matches grouped by
 * file, and lets the user replace a single occurrence or a CHECKED
 * BATCH of occurrences.
 *
 * Batch flow (the review-first safety net): every result row carries a
 * checkbox (default checked). "Replace Selected" does NOT write — it
 * first builds a review pane: each affected file is fetched, only its
 * checked rows' lines are transformed, and the file is rendered as a
 * WORD-LEVEL DIFF (word-diff.ts via <FileDiffPreview>). Each file has
 * its own include checkbox, and "Apply" writes ONLY the included files
 * through the same /api/file-write route the single replace uses — and
 * records every written file's pre-replace content as ONE multi-file
 * undo group, so a single Ctrl+Z afterwards restores the whole batch.
 * Unchecked rows never reach the review, so they are never touched.
 *
 * The replace flow is entirely client-side: for each affected file we
 * fetch the source, apply the replacement (literal or regex), and
 * write it back via `/api/file-write`. No new server route is needed
 * for the replace itself.
 *
 * The form state lives in <ProjectSearchForm>, which is only mounted
 * while the dialog is open — so the inputs reset to their defaults on
 * every open (matching the FindUsages / Rename dialogs).
 */
export function ProjectSearchDialog({
                                        open,
                                        onOpenChange,
                                        onJumpTo,
                                    }: ProjectSearchDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
                {open && (
                    <ProjectSearchForm
                        onJumpTo={onJumpTo}
                        onClose={() => onOpenChange(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

/* ================================================================== */
/*  Form (mounted only while the dialog is open)                       */

/* ================================================================== */

function ProjectSearchForm({
                               onJumpTo,
                               onClose,
                           }: {
    onJumpTo: (folderSlug: string, fileSlug: string, line: number) => void;
    onClose: () => void;
}) {
    const {toast} = useToast();

    const [find, setFind] = React.useState("");
    const [replace, setReplace] = React.useState("");
    const [useRegex, setUseRegex] = React.useState(false);
    const [showReplace, setShowReplace] = React.useState(false);

    const [hits, setHits] = React.useState<FtsHit[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [regexError, setRegexError] = React.useState<string | null>(null);
    const [replacing, setReplacing] = React.useState(false);
    /** The query actually used for the last successful search. Empty
     *  means "no search has run yet / the last search was cleared". */
    const [activeQuery, setActiveQuery] = React.useState("");
    const [activeUseRegex, setActiveUseRegex] = React.useState(false);

    /** Checked result-row keys — default EVERY row, so "Replace
     *  Selected" with nothing unchecked degrades to the old replace-all
     * (only now with a preview first). Reset whenever a new search's
     * hits land. */
    const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set());

    /** "search" = the results list; "review" = the pre-write diff pane. */
    const [stage, setStage] = React.useState<"search" | "review">("search");
    const [review, setReview] = React.useState<ReviewState | null>(null);

    const findInputRef = React.useRef<HTMLInputElement | null>(null);

    // Focus the Find input on mount.
    React.useEffect(() => {
        findInputRef.current?.focus();
    }, []);

    /* ── Regex helpers ────────────────────────────────────────────── */

    /**
     * The FTS endpoint does a case-insensitive *literal substring* match.
     * For regex mode we can't send the raw pattern (e.g. `\bfoo\b`) to
     * FTS — it would look for the literal backslashes. So we extract the
     * longest literal run from the regex and use that as the FTS seed,
     * then filter the returned hits client-side by re-testing each
     * snippet line against the full regex.
     */
    const ftsSeed = React.useCallback(
        (rawFind: string, regex: boolean): string => {
            if (!rawFind) return "";
            if (!regex) return rawFind;
            // Strip escape sequences (\b, \w, \d, \., …) and regex
            // metacharacters, then return the longest remaining literal run.
            const stripped = rawFind
                .replace(/\\./g, " ")
                .replace(/[.*+?^${}()|[\]\\]/g, " ");
            const parts = stripped.split(/\s+/).filter(Boolean);
            if (parts.length === 0) return "";
            return parts.reduce((a, b) => (b.length > a.length ? b : a));
        },
        [],
    );

    /** Build a RegExp (no /g) for testing snippets, or null on error. */
    const buildTestRegex = React.useCallback((pattern: string): RegExp | null => {
        try {
            return new RegExp(pattern);
        } catch {
            return null;
        }
    }, []);

    /* ── Search ───────────────────────────────────────────────────── */

    const runSearch = React.useCallback(async () => {
        const trimmed = find.trim();
        if (!trimmed) {
            setHits([]);
            setError(null);
            setActiveQuery("");
            setSelectedKeys(new Set());
            setStage("search");
            setReview(null);
            return;
        }
        // Validate regex up front so the user gets immediate feedback.
        if (useRegex) {
            const testRe = buildTestRegex(trimmed);
            if (!testRe) {
                setRegexError("Invalid regular expression.");
                return;
            }
            setRegexError(null);
        } else {
            setRegexError(null);
        }

        setLoading(true);
        setError(null);
        try {
            const seed = ftsSeed(trimmed, useRegex);
            if (!seed) {
                // The regex has no literal run to seed FTS with (e.g. pure
                // `\w+`). We can't enumerate files cheaply, so report zero.
                setHits([]);
                setActiveQuery(trimmed);
                setActiveUseRegex(useRegex);
                setSelectedKeys(new Set());
                setStage("search");
                setReview(null);
                return;
            }
            const url = `/api/full-text-search?q=${encodeURIComponent(seed)}&limit=100`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { hits?: FtsHit[] };
            let fetched = data.hits ?? [];

            // In regex mode, filter the hits client-side so only lines that
            // actually match the full regex survive.
            if (useRegex) {
                const re = buildTestRegex(trimmed);
                if (re) {
                    fetched = fetched.filter((h) => {
                        const lines = h.snippet.split("\n");
                        // The matched line is at index 1 of the 3-line snippet
                        // (FTS returns [line-1, line, line+1]). Test all three
                        // to be safe — non-empty snippet lines that match count.
                        return lines.some((l) => re.test(l));
                    });
                }
            }

            setHits(fetched);
            setActiveQuery(trimmed);
            setActiveUseRegex(useRegex);
            // A fresh result set starts fully checked — "Replace Selected"
            // with every box ticked then covers the same scope the old
            // replace-all did (but with a preview gate in front of the write).
            setSelectedKeys(new Set(fetched.map(hitKey)));
            setStage("search");
            setReview(null);
        } catch (e) {
            setError((e as Error).message);
            setHits([]);
            setActiveQuery("");
            setSelectedKeys(new Set());
            setStage("search");
            setReview(null);
        } finally {
            setLoading(false);
        }
    }, [find, useRegex, ftsSeed, buildTestRegex]);

    /* ── Group hits by file ───────────────────────────────────────── */

    const grouped = React.useMemo(() => {
        const map = new Map<
            string,
            {
                folder: string;
                folderSlug: string;
                file: string;
                fileSlug: string;
                hits: FtsHit[];
            }
        >();
        for (const h of hits) {
            const key = `${h.folderSlug}/${h.fileSlug}`;
            let entry = map.get(key);
            if (!entry) {
                entry = {
                    folder: h.folder,
                    folderSlug: h.folderSlug,
                    file: h.file,
                    fileSlug: h.fileSlug,
                    hits: [],
                };
                map.set(key, entry);
            }
            entry.hits.push(h);
        }
        return Array.from(map.values());
    }, [hits]);

    const totalMatches = hits.length;
    const totalFiles = grouped.length;

    /** Count of currently checked rows (drives the button label). */
    const selectedCount = React.useMemo(
        () => hits.reduce((n, h) => (selectedKeys.has(hitKey(h)) ? n + 1 : n), 0),
        [hits, selectedKeys]
    );

    /* ── Row / file / global selection toggles ───────────────────── */

    const toggleHit = (h: FtsHit) => {
        if (replacing) return;
        const key = hitKey(h);
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleGroupHits = (fileSlugGroup: { hits: FtsHit[] }) => {
        if (replacing) return;
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            const keys = fileSlugGroup.hits.map(hitKey);
            const all = keys.every((k) => next.has(k));
            for (const k of keys) {
                if (all) next.delete(k);
                else next.add(k);
            }
            return next;
        });
    };

    const selectAllHits = () => setSelectedKeys(new Set(hits.map(hitKey)));
    const clearAllHits = () => setSelectedKeys(new Set());

    /* ── Build the review pane (BEFORE any write) ────────────────── */

    /**
     * "Replace Selected" handler — computes, but does NOT write. For
     * every file with at least one checked row: fetch the live content,
     * transform ONLY the checked rows' lines (the same line-scoped
     * replacement the single-row Replace uses), and store the resulting
     * new content for the word-level diff. Unchecked rows never enter
     * this pipeline, so they are never written. Lines that no longer
     * match are marked stale and skipped.
     */
    const handleReplaceSelected = React.useCallback(async () => {
        if (!activeQuery || replacing) return;
        const selected = hits.filter((h) => selectedKeys.has(hitKey(h)));
        if (selected.length === 0) return;
        setStage("review");
        setReview({loading: true, files: [], includedKeys: new Set()});
        try {
            // Group the CHECKED rows by file (same grouping as the list).
            const byFile = new Map<
                string,
                { meta: FtsHit; rows: FtsHit[] }
            >();
            for (const h of selected) {
                const key = `${h.folderSlug}/${h.fileSlug}`;
                let entry = byFile.get(key);
                if (!entry) {
                    entry = {meta: h, rows: []};
                    byFile.set(key, entry);
                }
                entry.rows.push(h);
            }
            const groups = Array.from(byFile.values());

            const files = await mapPool(groups, async (group): Promise<ReviewFile> => {
                const fileName = decodeSlug(group.meta.fileSlug);
                const base: ReviewFile = {
                    folder: group.meta.folder,
                    folderSlug: group.meta.folderSlug,
                    file: group.meta.file,
                    fileSlug: group.meta.fileSlug,
                    fileName,
                    original: "",
                    newContent: "",
                    rows: [],
                    replacedCount: 0,
                };
                if (!fileName) {
                    return {...base, fetchError: "file path could not be resolved"};
                }
                const content = await fetchFileText(group.meta.folderSlug, group.meta.fileSlug);
                if (content === null) {
                    return {...base, fetchError: "file could not be read"};
                }
                const lines = content.split("\n");
                let replacedCount = 0;
                const rows: ReviewRow[] = [];
                for (const h of group.rows) {
                    const idx = h.line - 1;
                    const lineText = idx >= 0 && idx < lines.length ? lines[idx] : null;
                    if (lineText === null) {
                        rows.push({hit: h, stale: true, count: 0});
                        continue;
                    }
                    const {newContent: newLine, count} = applyReplacement(
                        lineText,
                        activeQuery,
                        replace,
                        activeUseRegex,
                    );
                    if (count > 0 && newLine !== lineText) {
                        lines[idx] = newLine;
                        replacedCount += count;
                        rows.push({hit: h, stale: false, count});
                    } else {
                        // The line drifted since the search ran (external edit, or
                        // the regex seed matched a context line the full pattern
                        // now rejects) — visible as stale, never written.
                        rows.push({hit: h, stale: true, count: 0});
                    }
                }
                return {
                    ...base,
                    original: content,
                    newContent: lines.join("\n"),
                    rows,
                    replacedCount,
                };
            });

            // Default include set: every file that would actually change.
            const includedKeys = new Set<string>();
            for (const f of files) {
                if (!f.fetchError && f.replacedCount > 0) includedKeys.add(fileKeyOf(f));
            }
            setReview({loading: false, files, includedKeys});
        } catch (e) {
            toast({
                title: "Could not build the preview",
                description: (e as Error).message,
                variant: "destructive",
            });
            setStage("search");
            setReview(null);
        }
    }, [activeQuery, activeUseRegex, hits, replace, replacing, selectedKeys, toast]);

    /* ── Apply the review (the only write in the batch flow) ─────── */

    const handleApplyReview = React.useCallback(async () => {
        if (!review || review.loading || replacing) return;
        const writable = review.files.filter(
            (f) =>
                review.includedKeys.has(fileKeyOf(f)) &&
                !f.fetchError &&
                f.replacedCount > 0 &&
                f.newContent !== f.original
        );
        if (writable.length === 0) return;
        setReplacing(true);
        const undoEntries: MultiFileUndoEntry[] = [];
        const skipped: string[] = [];
        let totalReplaced = 0;
        let filesChanged = 0;
        try {
            // Sequential writes: the folder watcher reacts to every save, and
            // stampeding dozens of simultaneous writes used to thrash the
            // folder cache mid-batch.
            for (const f of writable) {
                const writeRes = await fetch("/api/file-write", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: f.folderSlug,
                        fileName: f.fileName,
                        content: f.newContent,
                    }),
                });
                if (writeRes.ok) {
                    filesChanged++;
                    totalReplaced += f.replacedCount;
                    // Pre-replace content captured BEFORE the write — the whole
                    // batch becomes ONE Ctrl+Z group after the final write.
                    undoEntries.push({
                        folderSlug: f.folderSlug,
                        fileSlug: f.fileSlug,
                        fileName: f.fileName,
                        preContent: f.original,
                    });
                } else {
                    skipped.push(f.file);
                }
            }

            if (undoEntries.length > 0) {
                pushMultiFileUndoGroup({
                    label: `Replace “${activeQuery}” → “${replace}”`,
                    entries: undoEntries,
                });
                // One Ctrl+Z afterwards restores every file of this batch.
                armMultiFileUndoHotkey();
            }

            window.dispatchEvent(new CustomEvent("praxis:refresh-folders"));
            toast({
                title: skipped.length > 0 ? "Replace finished with errors" : "Replacements applied",
                description:
                    `Replaced ${totalReplaced} occurrence${totalReplaced === 1 ? "" : "s"} in ${filesChanged} file${filesChanged === 1 ? "" : "s"}.` +
                    (undoEntries.length > 0 ? " Ctrl+Z restores every touched file." : "") +
                    (skipped.length > 0
                        ? ` ${skipped.length} write${skipped.length === 1 ? "" : "s"} failed (${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? ", …" : ""}) — check them manually.`
                        : ""),
                variant: skipped.length > 0 ? "warning" : "success",
            });
            setStage("search");
            setReview(null);
            void runSearch();
        } catch (e) {
            toast({
                title: "Replace failed",
                description: (e as Error).message,
                variant: "destructive",
            });
        } finally {
            setReplacing(false);
        }
    }, [review, replacing, activeQuery, replace, runSearch, toast]);

    /* ── Replace a single occurrence (in one file, on one line) ──── */

    const handleReplaceOne = React.useCallback(
        async (folderSlug: string, fileSlug: string, fileName: string, line: number) => {
            if (!activeQuery) return;
            setReplacing(true);
            try {
                const res = await fetch(
                    `/api/code?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`,
                );
                if (!res.ok) {
                    toast({
                        title: "Replace failed",
                        description: `Could not read ${fileName} (HTTP ${res.status}).`,
                        variant: "destructive",
                    });
                    return;
                }
                const data = await res.json();
                const content: string = data.content ?? "";
                const lines = content.split("\n");
                const idx = line - 1;
                if (idx < 0 || idx >= lines.length) {
                    toast({
                        title: "Replace failed",
                        description: "Line is out of range.",
                        variant: "destructive",
                    });
                    return;
                }
                const original = lines[idx];
                const {newContent: newLine, count} = applyReplacement(
                    original,
                    activeQuery,
                    replace,
                    activeUseRegex,
                );
                if (count === 0 || newLine === original) {
                    toast({
                        title: "No match",
                        description: "That occurrence was no longer present on the line.",
                        variant: "warning",
                    });
                    return;
                }
                lines[idx] = newLine;
                const newContent = lines.join("\n");
                const writeRes = await fetch("/api/file-write", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: folderSlug,
                        fileName,
                        content: newContent,
                    }),
                });
                if (writeRes.ok) {
                    toast({
                        title: "Replaced",
                        description: `1 occurrence in ${fileName}.`,
                        variant: "success",
                    });
                    void runSearch();
                } else {
                    toast({
                        title: "Replace failed",
                        description: `HTTP ${writeRes.status}`,
                        variant: "destructive",
                    });
                }
            } catch (e) {
                toast({
                    title: "Replace failed",
                    description: (e as Error).message,
                    variant: "destructive",
                });
            } finally {
                setReplacing(false);
            }
        },
        [activeQuery, activeUseRegex, replace, toast, runSearch],
    );

    /* ── Render ───────────────────────────────────────────────────── */

    const canSearch = find.trim().length > 0 && !loading;
    const canReplaceAll =
        !replacing && selectedCount > 0 && activeQuery.length > 0 && stage === "search";

    const reviewWritableCount = React.useMemo(() => {
        if (!review || review.loading) return 0;
        return review.files.filter(
            (f) => review.includedKeys.has(fileKeyOf(f)) && !f.fetchError && f.replacedCount > 0
        ).length;
    }, [review]);

    const reviewReplacedTotal = React.useMemo(() => {
        if (!review || review.loading) return 0;
        return review.files.reduce(
            (n, f) =>
                review.includedKeys.has(fileKeyOf(f)) && !f.fetchError ? n + f.replacedCount : n,
            0
        );
    }, [review]);

    /* ── Render: SEARCH stage (inputs + checked result rows) ──────── */

    const renderSearchStage = () => (
        <>
            {/* ── Find / Replace inputs ───────────────────────────────── */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        aria-label={showReplace ? "Hide replace field" : "Show replace field"}
                        aria-pressed={showReplace}
                        title={showReplace ? "Hide replace field" : "Show replace field (Toggle Replace)"}
                        onClick={() => setShowReplace((v) => !v)}
                    >
                        {showReplace ? (
                            <ChevronDown className="size-4"/>
                        ) : (
                            <ChevronRight className="size-4"/>
                        )}
                    </Button>
                    <Input
                        ref={findInputRef}
                        value={find}
                        onChange={(e) => setFind(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && canSearch) {
                                e.preventDefault();
                                void runSearch();
                            }
                        }}
                        placeholder="Find in files…"
                        className="font-mono flex-1"
                        aria-label="Find"
                    />
                    <Button
                        type="button"
                        variant={useRegex ? "default" : "outline"}
                        size="sm"
                        className="h-9 px-2 gap-1 font-mono"
                        aria-label="Use regular expression"
                        aria-pressed={useRegex}
                        title="Use regular expression (.* mode)"
                        onClick={() => setUseRegex((v) => !v)}
                    >
                        <RegexIcon className="size-3.5"/>
                        <span className="text-xs">.*</span>
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        disabled={!canSearch}
                        onClick={() => void runSearch()}
                    >
                        {loading ? (
                            <Loader2 className="size-4 animate-spin"/>
                        ) : (
                            <Search className="size-4"/>
                        )}
                        Search
                    </Button>
                </div>

                {regexError && (
                    <p className="text-xs text-destructive pl-8">{regexError}</p>
                )}

                {showReplace && (
                    <div className="flex items-center gap-1.5">
                        <div className="size-7 shrink-0 flex items-center justify-center">
                            <ReplaceIcon className="size-4 text-muted-foreground"/>
                        </div>
                        <Input
                            value={replace}
                            onChange={(e) => setReplace(e.target.value)}
                            placeholder="Replace with…"
                            className="font-mono flex-1"
                            aria-label="Replace"
                        />
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={!canReplaceAll}
                            onClick={() => void handleReplaceSelected()}
                            title="Preview the checked matches before any file is written"
                        >
                            {replacing ? (
                                <Loader2 className="size-4 animate-spin"/>
                            ) : (
                                <ReplaceAll className="size-4"/>
                            )}
                            Replace selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
                        </Button>
                    </div>
                )}
            </div>

            {/* ── Match count + selection toolbar ─────────────────────── */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-h-5 flex-wrap">
                {loading ? (
                    <span className="flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin"/> Searching…
          </span>
                ) : error ? (
                    <span className="text-destructive flex items-center gap-1.5">
            <CircleAlert className="size-3.5"/> Search failed: {error}
          </span>
                ) : activeQuery ? (
                    <>
            <span>
              {totalMatches} match{totalMatches === 1 ? "" : "es"} in{" "}
                {totalFiles} file{totalFiles === 1 ? "" : "s"}
                {activeUseRegex && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                        regex
                    </Badge>
                )}
            </span>
                        {totalMatches > 0 ? (
                            <span className="ml-auto flex items-center gap-1">
                <span className="mr-1">
                  {selectedCount}/{totalMatches} selected
                </span>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={selectAllHits}
                    disabled={replacing || selectedCount === totalMatches}
                >
                  Select all
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={clearAllHits}
                    disabled={replacing || selectedCount === 0}
                >
                  Clear
                </Button>
              </span>
                        ) : null}
                    </>
                ) : (
                    <span>Type a query and press Search (or Enter).</span>
                )}
            </div>

            {/* ── Results list (grouped by file, every row with a checkbox) */}
            <div className="flex-1 min-h-0 rounded-md border overflow-hidden">
                <ScrollArea className="h-full max-h-[52vh]">
                    {hits.length === 0 && !loading && !error && activeQuery ? (
                        <div
                            className="flex items-center justify-center py-12 px-8 text-center text-sm text-muted-foreground">
                            No matches found.
                        </div>
                    ) : hits.length === 0 && !loading && !error ? (
                        <div
                            className="flex items-center justify-center py-12 px-8 text-center text-sm text-muted-foreground">
                            Results will appear here.
                        </div>
                    ) : (
                        <ul className="divide-y">
                            {grouped.map((group) => {
                                const groupKeys = group.hits.map(hitKey);
                                const allChecked = groupKeys.every((k) => selectedKeys.has(k));
                                const someChecked = groupKeys.some((k) => selectedKeys.has(k));
                                return (
                                    <li key={`${group.folderSlug}/${group.fileSlug}`}>
                                        {/* File header: master checkbox for the whole group */}
                                        <div
                                            className="px-3 py-2 bg-muted/40 flex items-center gap-2 text-xs sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/30">
                                            <Checkbox
                                                checked={allChecked ? true : someChecked ? "indeterminate" : false}
                                                onCheckedChange={() => toggleGroupHits(group)}
                                                disabled={replacing}
                                                aria-label={`Select all matches in ${group.file}`}
                                                className="shrink-0"
                                            />
                                            <FileSearch className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="font-mono font-medium truncate">
                        {group.file}
                      </span>
                                            <span className="text-muted-foreground truncate">
                        in {group.folder}
                      </span>
                                            <Badge variant="secondary" className="ml-auto shrink-0">
                                                {group.hits.length}
                                            </Badge>
                                        </div>
                                        {/* Individual matches */}
                                        <ul className="divide-y">
                                            {group.hits.map((hit, idx) => {
                                                const snippetLines = hit.snippet.split("\n");
                                                // FTS returns a 3-line snippet: [line-1, line, line+1].
                                                // The matched line is the middle one; empty context
                                                // lines (at file start/end) are skipped on render.
                                                const matchedIdx = 1;
                                                const key = hitKey(hit);
                                                const checked = selectedKeys.has(key);
                                                return (
                                                    <li
                                                        key={`${hit.line}-${idx}`}
                                                        className={cn(
                                                            "group flex items-stretch",
                                                            !checked && "opacity-55"
                                                        )}
                                                    >
                                                        <div className="flex items-center pl-3 pr-1 shrink-0">
                                                            <Checkbox
                                                                checked={checked}
                                                                onCheckedChange={() => toggleHit(hit)}
                                                                disabled={replacing}
                                                                aria-label={`Include match on line ${hit.line} in ${hit.file}`}
                                                            />
                                                        </div>
                                                        <div
                                                            className="flex-1 min-w-0 flex hover:bg-accent/50 transition-colors">
                                                            <button
                                                                onClick={() => {
                                                                    onJumpTo(hit.folderSlug, hit.fileSlug, hit.line);
                                                                    onClose();
                                                                }}
                                                                className="flex-1 min-w-0 text-left px-3 py-1.5 flex items-start gap-2"
                                                                title="Jump to this match"
                                                            >
                                <span
                                    className="text-[10px] text-muted-foreground font-mono shrink-0 mt-0.5 w-10 text-right">
                                  {hit.line}
                                </span>
                                                                <pre
                                                                    className="text-[11px] font-mono mt-0.5 whitespace-pre-wrap break-all flex-1 min-w-0">
                                  {snippetLines.map((l, li) => (
                                      <span
                                          key={li}
                                          className={
                                              li === matchedIdx
                                                  ? "block bg-yellow-100/70 dark:bg-yellow-500/20 -mx-1 px-1 rounded"
                                                  : "block text-muted-foreground"
                                          }
                                      >
                                      {li === matchedIdx
                                          ? highlightLine(l, activeQuery, activeUseRegex)
                                          : l}
                                    </span>
                                  ))}
                                </pre>
                                                                <CornerDownLeft
                                                                    className="size-3 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"/>
                                                            </button>
                                                            <div className="border-l flex items-center pr-2">
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-7 px-2 text-[11px] gap-1"
                                                                    disabled={replacing}
                                                                    onClick={() =>
                                                                        void handleReplaceOne(
                                                                            hit.folderSlug,
                                                                            hit.fileSlug,
                                                                            hit.file,
                                                                            hit.line,
                                                                        )
                                                                    }
                                                                    title="Replace this occurrence (writes immediately)"
                                                                >
                                                                    <ReplaceIcon className="size-3.5"/>
                                                                    Replace
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </ScrollArea>
            </div>
        </>
    );

    /* ── Render: REVIEW stage (per-file diff before writing) ──────── */

    const renderReviewStage = () => (
        <>
            {/* Compact query context so the pane is self-explanatory. */}
            <div className="flex items-center gap-2 flex-wrap text-xs min-h-5">
        <span className="font-mono">
          <mark className="bg-yellow-300/80 dark:bg-yellow-500/40 text-foreground rounded px-0">
            {activeQuery}
          </mark>
          <span className="mx-1 text-muted-foreground">→</span>
          <mark className="bg-emerald-300/70 dark:bg-emerald-500/30 text-foreground rounded px-0">
            {replace || "(empty)"}
          </mark>
        </span>
                {activeUseRegex ? (
                    <Badge variant="secondary" className="text-[10px]">regex</Badge>
                ) : null}
                <span className="text-muted-foreground">
          {reviewReplacedTotal} replacement{reviewReplacedTotal === 1 ? "" : "s"} in{" "}
                    {reviewWritableCount} file{reviewWritableCount === 1 ? "" : "s"} will be written.
        </span>
            </div>

            <div className="flex-1 min-h-0 rounded-md border overflow-hidden">
                <ScrollArea className="h-full max-h-[52vh]">
                    {review && review.loading ? (
                        <div
                            className="py-12 px-8 text-sm text-muted-foreground flex items-center justify-center gap-2 text-center">
                            <Loader2 className="size-4 animate-spin shrink-0"/>
                            Fetching affected files and computing diffs…
                        </div>
                    ) : !review || review.files.length === 0 ? (
                        <div
                            className="flex items-center justify-center py-12 px-8 text-center text-sm text-muted-foreground">
                            Nothing to preview.
                        </div>
                    ) : (
                        <ul className="divide-y">
                            {review.files.map((f) => {
                                const fk = fileKeyOf(f);
                                const included = review.includedKeys.has(fk);
                                const staleRows = f.rows.filter((r) => r.stale);
                                return (
                                    <li key={fk}>
                                        {/* Per-file header: include checkbox + identity + stats */}
                                        <div
                                            className="px-3 py-2 bg-muted/40 flex items-center gap-2 text-xs sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/30">
                                            <Checkbox
                                                checked={included}
                                                onCheckedChange={() =>
                                                    setReview((prev) =>
                                                        prev
                                                            ? {
                                                                ...prev,
                                                                includedKeys: new Set(
                                                                    prev.includedKeys.has(fk)
                                                                        ? Array.from(prev.includedKeys).filter((k) => k !== fk)
                                                                        : [...prev.includedKeys, fk]
                                                                ),
                                                            }
                                                            : prev
                                                    )
                                                }
                                                disabled={replacing || f.fetchError !== undefined || f.replacedCount === 0}
                                                aria-label={`Include ${f.file} in the replacement`}
                                                className="shrink-0"
                                            />
                                            <FileSearch className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="font-mono font-medium truncate" title={f.fileName}>
                        {f.file}
                      </span>
                                            <span className="text-muted-foreground truncate">in {f.folder}</span>
                                            {f.fetchError ? (
                                                <Badge variant="destructive" className="ml-auto shrink-0 text-[10px]">
                                                    {f.fetchError}
                                                </Badge>
                                            ) : f.replacedCount === 0 ? (
                                                <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                                                    no change (stale)
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="ml-auto shrink-0">
                                                    {f.replacedCount} replacement{f.replacedCount === 1 ? "" : "s"}
                                                </Badge>
                                            )}
                                        </div>
                                        {/* The word-level diff of this file's replacements */}
                                        {f.fetchError ? (
                                            <p className="px-3 py-2 text-xs text-destructive flex items-center gap-1.5">
                                                <CircleAlert className="size-3.5"/>
                                                {f.fetchError} — this file will NOT be written.
                                            </p>
                                        ) : (
                                            <>
                                                <FileDiffPreview oldContent={f.original} newContent={f.newContent}/>
                                                {staleRows.length > 0 ? (
                                                    <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
                                                        {staleRows.length} checked
                                                        row{staleRows.length === 1 ? "" : "s"} on
                                                        this file no longer matched (lines
                                                        {" "}
                                                        {staleRows.map((r) => r.hit.line).join(", ")}) and were skipped.
                                                    </p>
                                                ) : null}
                                            </>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </ScrollArea>
            </div>
        </>
    );

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    {stage === "review" ? (
                        <ReplaceAll className="size-5"/>
                    ) : (
                        <Search className="size-5"/>
                    )}
                    {stage === "review" ? "Review replacements" : "Find in Files"}
                </DialogTitle>
                <DialogDescription>
                    {stage === "review" ? (
                        <>
                            Word-level preview of every checked replacement. Uncheck a
                            file to exclude it; Apply writes only the included files —
                            unchecked rows are never touched.
                        </>
                    ) : (
                        <>
                            Search every <code>.py</code> file across all folders. Click a
                            result to jump to it, replace one occurrence, or review a
                            checked batch before it is written.
                        </>
                    )}
                </DialogDescription>
            </DialogHeader>

            {stage === "search" ? renderSearchStage() : renderReviewStage()}

            <DialogFooter className="gap-2 sm:gap-0">
                {stage === "review" ? (
                    <>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setStage("search");
                                setReview(null);
                            }}
                            disabled={replacing}
                        >
                            <ArrowLeft className="size-4"/>
                            Back
                        </Button>
                        <Button
                            onClick={() => void handleApplyReview()}
                            disabled={replacing || !review || review.loading || reviewWritableCount === 0}
                        >
                            {replacing ? (
                                <Loader2 className="size-4 animate-spin"/>
                            ) : (
                                <ReplaceAll className="size-4"/>
                            )}
                            Apply ({reviewReplacedTotal})
                        </Button>
                    </>
                ) : (
                    <Button variant="outline" onClick={onClose} disabled={replacing}>
                        Close
                    </Button>
                )}
            </DialogFooter>
        </>
    );
}
