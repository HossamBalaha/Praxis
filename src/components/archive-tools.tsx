"use client";

import * as React from "react";
import {
    Archive,
    ChevronRight,
    Download,
    FileWarning,
    FolderInput,
    FolderPlus,
    Loader2,
    PackageOpen,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {useToast} from "@/hooks/use-toast";
import {fileUrlFor} from "@/lib/prefetch";

/**
 * ArchiveTools — the viewer card for COMPRESSED FILES opened in the
 * explorer. The formats handled depend on the extractor binaries the
 * host has (probed once through a `capabilities` action against
 * /api/archive — lib/archive-caps):
 *
 *  • .zip                      — entry listing (pure-JS central-
 *                                directory read) + Extract here /
 *                                Extract to a new subfolder…
 *  • .tar / .tar.gz / .tgz /
 *    .tar.bz2 / .tar.xz        — entry listing (system tar) + both
 *                                extract options
 *  • .gz (single)              — Decompress into the sibling file
 *  • .xz / .bz2 (single)       — Decompress (system xz / bzip2)
 *  • .rar                      — listing + extraction (the built-in
 *                                WASM unrar works everywhere; a system
 *                                unrar / 7z-with-RAR is used as a
 *                                fallback when present)
 *  • .7z                       — listing (7z `l -slt` or bsdtar) +
 *                                both extract options
 *  • anything without a local
 *    handler                   — explanatory card (with the formats
 *                                that ARE available) + Download
 *
 * After an extract / decompress the explorer tree refreshes through
 * the shared `praxis:refresh-folders` event.
 */

// The matcher lives in lib/archive-match.ts (pure, client-safe, no
// component graph) — re-exported here for every existing import.
export {isArchiveFileName} from "@/lib/archive-match";

/** Upper bound for the entry-listing request (ms) — a hung server can
 *  never hold the skeleton overlay or the busy flag forever. */
const LIST_TIMEOUT_MS = 30_000;
/** Upper bound for the capabilities probe (ms) — the unsupported-card
 *  reveal effect waits for caps to settle, so the probe must always
 *  settle even when the request stalls. */
const CAPS_TIMEOUT_MS = 8_000;

/** Fetch with an abort timeout — resolves with a rejected promise when
 *  the deadline passes, so every caller's finally/catch path runs and
 *  its busy state always clears. */
function FetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    // One abort controller per request.
    const controller = new AbortController();
    // Arm the deadline timer.
    const timer = setTimeout(() => {
        controller.abort();
    }, timeoutMs);
    // Return a promise that always disarms the timer when settled.
    return fetch(url, {...init, signal: controller.signal}).finally(() => {
        clearTimeout(timer);
    });
}

interface EntryInfo {
    name: string;
    size: number;
    isDir: boolean;
}

function formatBytes(n: number): string {
    if (n <= 0) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArchiveTools({
                                 fileName,
                                 folderSlug,
                                 fileSlug,
                                 onReady,
                             }: {
    fileName: string;
    folderSlug: string;
    fileSlug: string;
    /** Fired once the viewer's surface is actually on screen — the
     *  entry listing parsed, a listing error rendered, or the
     *  unsupported / single-stream decompress card committed. The
     *  FileViewer holds its kind-aware skeleton overlay until then
     *  (the listing array being non-null is the reveal condition for
     *  real archives). */
    onReady?: () => void;
}) {
    const {toast} = useToast();
    const [entries, setEntries] = React.useState<EntryInfo[] | null>(null);
    const [totalEntries, setTotalEntries] = React.useState(0);
    const [truncated, setTruncated] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [unsupported, setUnsupported] = React.useState(false);
    /* Single-file .gz/.xz/.bz2 streams never run the listing path —
     * list() early-returns for them, so an initial busy="list" would
     * never clear and the decompress card's button (disabled={busy !==
     * null}) stayed PERMANENTLY disabled: the "xx.md.gz stuck" report.
     * Initialize busy by KIND: "list" only for formats that actually
     * list; null for the single-stream trio. */
    // Lowercase the file name once for the kind probes.
    const lower0 = fileName.toLowerCase();
    // Tar-shaped archives run the listing path (their compressed suffix is part of the tar name).
    const isTar0 = /\.(tar|tar\.gz|tgz|tar\.bz2|tar\.xz|tbz2|txz)$/i.test(lower0);
    // Single-stream files (.gz / .xz / .bz2 alone) skip the listing path entirely.
    const isSingleStream0 = !isTar0 && /\.(gz|xz|bz2)$/i.test(lower0);
    // The busy state starts as "list" only for formats that actually list.
    const [busy, setBusy] = React.useState<"list" | "extract" | "gz" | null>(isSingleStream0 ? null : "list");

    const lower = fileName.toLowerCase();
    const isZip = lower.endsWith(".zip");
    const isTar =
        lower.endsWith(".tar") || lower.endsWith(".tar.gz") || lower.endsWith(".tgz") ||
        lower.endsWith(".tar.bz2") || lower.endsWith(".tar.xz") || lower.endsWith(".tbz2") || lower.endsWith(".txz");
    const isGz = !isTar && lower.endsWith(".gz");
    const isXz = !isTar && lower.endsWith(".xz");
    const isBz2 = !isTar && lower.endsWith(".bz2");
    const isRar = lower.endsWith(".rar");
    const is7z = lower.endsWith(".7z");
    // Host capabilities — which extractor binaries exist here.
    const [caps, setCaps] = React.useState<{
        tar: boolean;
        rarJs?: boolean;
        unrar: boolean;
        unrarBin?: string | null;
        xz: boolean;
        bzip2: boolean;
        p7zip: boolean;
        p7zipBin?: string | null;
        p7zipRar?: boolean;
        bsdtar?: boolean;
    } | null>(null);
    React.useEffect(() => {
        // Cancel flag for the async probe.
        let cancelled = false;
        // Probe the host's extractor binaries with a bounded timeout.
        FetchWithTimeout("/api/archive", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "capabilities"}),
        }, CAPS_TIMEOUT_MS)
            .then(async (res) => {
                // Parse the capabilities payload defensively.
                const data = await res.json().catch(() => null);
                // Commit the capabilities when the response carries them.
                if (!cancelled && res.ok && data?.capabilities) setCaps(data.capabilities);
            })
            .catch(() => { /* capabilities stay unknown — the per-format fallbacks apply */
            })
            .finally(() => {
                // Settle caps to a conservative empty object on failure so the
                // unsupported-card reveal effect is never left waiting on a
                // probe that will never answer (eternal skeleton guard).
                if (!cancelled) {
                    setCaps((prev) => (prev === null ? {
                        tar: false,
                        rarJs: false,
                        unrar: false,
                        xz: false,
                        bzip2: false,
                        p7zip: false,
                        bsdtar: false,
                    } : prev));
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);
    // Capability-aware gating (mirrors the server): a format whose
    // handler is missing shows the honest unsupported card instead of a
    // doomed request. Before the caps arrive every format stays
    // optimistic so the initial list isn't blocked.
    const supported =
        isZip ||
        (isTar && (caps === null || caps.tar)) ||
        isGz ||
        (isXz && (caps === null || caps.xz)) ||
        (isBz2 && (caps === null || caps.bzip2)) ||
        (isRar && (caps === null || !!caps.rarJs || caps.unrar || !!caps.p7zipRar)) ||
        (is7z && (caps === null || caps.p7zip || !!caps.bsdtar));

    const list = React.useCallback(() => {
        // Single streams and unsupported formats never list.
        if (!supported || isGz || isXz || isBz2) return;
        // Mark the listing as in flight.
        setBusy("list");
        // Clear any previous listing error.
        setError(null);
        // Fetch the entries with a hard timeout so busy always clears.
        FetchWithTimeout("/api/archive", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "list", folder: folderSlug, file: fileSlug}),
        }, LIST_TIMEOUT_MS)
            .then(async (res) => {
                // Parse the listing payload defensively.
                const data = await res.json().catch(() => null);
                // Surface the server's unsupported marker when present.
                if (!res.ok || !data?.ok) {
                    setUnsupported(!!data?.unsupported);
                    throw new Error(data?.error ?? `HTTP ${res.status}`);
                }
                // Commit the entry listing.
                setEntries((data.entries ?? []) as EntryInfo[]);
                // Commit the total entry count.
                setTotalEntries(data.totalEntries ?? data.entries?.length ?? 0);
                // Commit the truncation flag.
                setTruncated(!!data.truncated);
                // the listing array is committed — tell the host it can drop
                // its skeleton overlay.
                onReady?.();
            })
            .catch((err) => {
                // Show the listing error in place of the table.
                setError((err as Error).message);
                // an errored listing IS the final surface — reveal it too,
                // otherwise the host overlay would never clear.
                onReady?.();
            })
            .finally(() => setBusy(null));
    }, [supported, isGz, isXz, isBz2, folderSlug, fileSlug, onReady]);

    React.useEffect(() => {
        list();
    }, [list]);

    // REVEAL for the no-listing surfaces: single-file .gz/.xz/.bz2
    // streams render their decompress card immediately (nothing to
    // wait for), and a format the host cannot handle shows its
    // unsupported card once the capabilities probe settles. Both fire
    // onReady so the FileViewer's skeleton overlay never outlives its
    // content. (onReady is a stable useCallback on the host side.)
    // True when this file is a single-file stream.
    const singleStream = isGz || isXz || isBz2;
    // True when the stream's decompressor binary is KNOWN to be missing
    // (.gz is built into the server via node:zlib, so it never is).
    const streamHandlerMissing =
        (isXz && caps !== null && !caps.xz) ||
        (isBz2 && caps !== null && !caps.bzip2);
    React.useEffect(() => {
        // Single streams have no listing to wait for — reveal right away.
        if (singleStream) onReady?.();
    }, [singleStream, onReady]);
    React.useEffect(() => {
        // Unsupported non-stream formats reveal once the caps settle.
        if (caps !== null && !supported && !singleStream) onReady?.();
    }, [caps, supported, singleStream, onReady]);

    const refreshTree = () =>
        window.dispatchEvent(new CustomEvent("praxis:refresh-folders"));

    const extract = (dest: "here" | "subfolder") => {
        let subfolderName: string | undefined;
        if (dest === "subfolder") {
            const def = fileName.replace(/\.(zip|tar|tgz|gz|bz2|xz|7z|rar|tbz2|txz)$/i, "").replace(/\.tar$/i, "");
            const answer = window.prompt("Extract into a new subfolder named…", def || "extracted");
            if (!answer) return;
            subfolderName = answer;
        }
        setBusy("extract");
        setError(null);
        fetch("/api/archive", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "extract", folder: folderSlug, file: fileSlug, dest, subfolderName}),
        })
            .then(async (res) => {
                const data = await res.json().catch(() => null);
                if (!res.ok || !data?.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
                toast({
                    title: "Archive extracted",
                    description: `${data.count !== undefined ? `${data.count} files → ` : ""}${data.path ?? "the containing folder"}`,
                    variant: "success",
                });
                refreshTree();
            })
            .catch((err) => {
                toast({title: "Extraction failed", description: (err as Error).message, variant: "destructive"});
            })
            .finally(() => setBusy(null));
    };

    const decompressGz = () => {
        // Mark the decompression as in flight.
        setBusy("gz");
        // Run the decompress with a hard timeout so busy always clears.
        FetchWithTimeout("/api/archive", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "extract", folder: folderSlug, file: fileSlug}),
        }, LIST_TIMEOUT_MS)
            .then(async (res) => {
                // Parse the decompress payload defensively.
                const data = await res.json().catch(() => null);
                // Throw the server's error when the response is not ok.
                if (!res.ok || !data?.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
                // Report the decompressed output file.
                toast({
                    title: "Decompressed",
                    description: `${fileName} → ${data.path ?? ""} (${formatBytes(data.size ?? 0)})`,
                    variant: "success",
                });
                // Refresh the explorer so the new sibling file appears.
                refreshTree();
            })
            .catch((err) => {
                // Surface the failure as a toast (the card stays usable).
                toast({title: "Decompression failed", description: (err as Error).message, variant: "destructive"});
            })
            .finally(() => setBusy(null));
    };

    const download = () => {
        const a = document.createElement("a");
        a.href = fileUrlFor(folderSlug, fileSlug);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const kindLabel = isZip
        ? "ZIP archive"
        : isTar
            ? "Tarball"
            : isGz
                ? "GZip-compressed file"
                : isXz
                    ? "XZ-compressed file"
                    : isBz2
                        ? "BZip2-compressed file"
                        : isRar
                            ? "RAR archive"
                            : is7z
                                ? "7-Zip archive"
                                : "Archive";

    return (
        <div className="p-4 md:p-6 w-full">
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <Archive className="size-5 text-emerald-500"/>
                <div className="mr-auto">
                    <p className="text-sm font-semibold text-foreground">{fileName}</p>
                    <p className="text-xs text-muted-foreground">{kindLabel}</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={download}
                        title="Download the archive to your computer">
                    <Download className="size-3.5"/> Download
                </Button>
            </div>

            {(isGz || isXz || isBz2) && !streamHandlerMissing ? (
                <div className="rounded-lg border bg-card p-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                        A single-file {isGz ? "gzip" : isXz ? "xz" : "bzip2"} stream. Decompress it into a new file next
                        to the archive —
                        the <code className="font-mono">{isGz ? ".gz" : isXz ? ".xz" : ".bz2"}</code> suffix is stripped
                        from the name.
                    </p>
                    <Button size="sm" className="gap-1.5 text-xs" disabled={busy !== null} onClick={decompressGz}>
                        {busy === "gz" ? <Loader2 className="size-3.5 animate-spin"/> :
                            <PackageOpen className="size-3.5"/>}
                        Decompress to {fileName.replace(/\.(gz|xz|bz2)$/i, "")}
                    </Button>
                </div>
            ) : !supported || streamHandlerMissing ? (
                <div className="rounded-lg border bg-card p-6 flex flex-col items-center text-center gap-2">
                    <FileWarning className="size-8 text-muted-foreground/50"/>
                    <p className="text-sm font-medium">No inline handler for this format</p>
                    <p className="text-xs text-muted-foreground max-w-md">
                        {fileName} — no inline handler for this format on this machine. Available here:{" "}
                        <b>
                            .zip{caps?.tar ? ", .tar / .tar.gz / .tgz" : ""}, single-file .gz{caps?.xz ? " / .xz" : ""}
                            {caps?.bzip2 ? " / .bz2" : ""}{(caps?.rarJs || caps?.unrar || caps?.p7zipRar) ? ", .rar" : ""}{(caps?.p7zip || caps?.bsdtar) ? ", .7z" : ""}
                        </b>
                        . Download this archive and extract it with a local tool.
                    </p>
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <Button
                            size="sm"
                            className="gap-1.5 text-xs"
                            disabled={busy !== null}
                            onClick={() => extract("here")}
                            title="Extract every entry directly into the folder that contains this archive"
                        >
                            {busy === "extract" ? <Loader2 className="size-3.5 animate-spin"/> :
                                <FolderInput className="size-3.5"/>}
                            Extract here
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            disabled={busy !== null}
                            onClick={() => extract("subfolder")}
                            title="Extract into a new subfolder (named after the archive by default)"
                        >
                            <FolderPlus className="size-3.5"/>
                            Extract to a new subfolder…
                        </Button>
                        {entries !== null && (
                            <span className="ml-auto text-[11px] text-muted-foreground">
                {totalEntries.toLocaleString()} entr{totalEntries === 1 ? "y" : "ies"}
                                {truncated ? " · showing first 500" : ""}
              </span>
                        )}
                    </div>

                    {error && (
                        <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-md p-2 mb-3">{error}</p>
                    )}
                    {busy === "list" ? (
                        /* Skeleton while the entries load — shimmer rows shaped
                         * like the results table (index / name / size). */
                        <div className="rounded-md border overflow-hidden" aria-busy="true"
                             aria-label={`Reading ${fileName}`}>
                            <div className="flex items-center gap-2 border-b bg-muted px-2 py-1.5">
                                <Skeleton className="h-3 w-6"/>
                                <Skeleton className="h-3 flex-1"/>
                                <Skeleton className="h-3 w-12"/>
                            </div>
                            {Array.from({length: 8}, (_, i) => (
                                <div key={i} className="flex items-center gap-2 border-b border-border/40 px-2 py-1.5">
                                    <Skeleton className="h-3 w-6"/>
                                    <Skeleton className="h-3 flex-1" style={{maxWidth: `${72 - ((i * 13) % 40)}%`}}/>
                                    <Skeleton className="h-3 w-12"/>
                                </div>
                            ))}
                            <div
                                className="flex items-center justify-center gap-2 py-2 text-[11px] text-muted-foreground">
                                <Loader2 className="size-3 animate-spin"/> Reading {fileName}…
                            </div>
                        </div>
                    ) : null}
                    {entries !== null && (
                        <div className="rounded-md border overflow-auto max-h-[50vh]">
                            <table className="w-full text-xs" aria-label="Archive entries">
                                <thead className="sticky top-0 bg-muted">
                                <tr className="[&>th]:border-b">
                                    <th className="text-right font-medium px-2 py-1 border-b whitespace-nowrap">#</th>
                                    <th className="text-left font-medium px-2 py-1 border-b">Name</th>
                                    <th className="text-right font-medium px-2 py-1 border-b whitespace-nowrap">Size</th>
                                </tr>
                                </thead>
                                <tbody>
                                {entries.map((e, i) => {
                                    /* depth indent — inner entries shift right of their
                                     * parent folder, like a file-structure tree: the
                                     * path's segment count decides the shift (a
                                     * top-level folder sits at 0, its children one
                                     * step in, and so on). */
                                    const segs = e.name.split("/").filter(Boolean);
                                    const depth = Math.max(0, segs.length - 1);
                                    const base = segs[segs.length - 1] ?? e.name;
                                    const parentPath = segs.slice(0, -1).join("/");
                                    return (
                                        <tr key={`${e.name}-${i}`} className={i % 2 === 1 ? "bg-muted/30" : undefined}>
                                            <td className="text-right text-muted-foreground tabular-nums select-none px-2 py-1 border-b border-border/40 font-mono text-[11px]">
                                                {i + 1}
                                            </td>
                                            <td className="px-2 py-1 border-b border-border/40 font-mono text-[11px] break-all">
                        <span
                            className="inline-flex items-center gap-1"
                            style={{paddingLeft: `${depth * 14}px`}}
                            title={e.name}
                        >
                          {e.isDir ? <ChevronRight className="size-3 text-emerald-500 shrink-0"/> : null}
                            {e.isDir ? (
                                <span className="text-foreground/90">{base}/</span>
                            ) : (
                                <span>
                              {parentPath ? (
                                  <span className="text-muted-foreground">{parentPath}/</span>
                              ) : null}
                                    <span className="text-foreground/90">{base}</span>
                            </span>
                            )}
                        </span>
                                            </td>
                                            <td className="text-right px-2 py-1 border-b border-border/40 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                                                {formatBytes(e.size)}
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
