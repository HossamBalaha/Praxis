"use client";

import * as React from "react";
import {
    ChevronDown,
    ChevronUp,
    CircleAlert,
    Eraser,
    ExternalLink,
    Inbox,
    RotateCw,
    Terminal,
    TriangleAlert,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select";
import {Skeleton} from "@/components/ui/skeleton";
import {cn} from "@/lib/utils";
import {STORAGE_PREFIX} from "@/lib/config";

/**
 * live-preview-panel.tsx — the bottom-panel "Preview" tab body.
 *
 * Serves an entry HTML document of the active folder through
 * /api/preview (which injects the live-reload + console-piping
 * bootstrap script) inside a sandboxed iframe. The panel itself keeps
 * its own /api/preview-stream connection to drive the status strip and
 * refresh the entry dropdown when files appear/disappear.
 *
 * Console lines arrive as window.message events with
 * { source: "praxis-preview", kind, … } — posted by the injected
 * script. Args are rendered as strings only (JSON.stringify + 300-char
 * truncation); nothing from the page is ever evaluated here.
 */

// ─── constants ──────────────────────────────────────────────────────

interface DevicePreset {
    key: string;
    label: string;
    /** null = Responsive — fill the available width. */
    width: number | null;
}

const DEVICE_PRESETS: DevicePreset[] = [
    {key: "responsive", label: "Responsive", width: null},
    {key: "iphone", label: "iPhone 390", width: 390},
    {key: "pixel", label: "Pixel 412", width: 412},
    {key: "ipad", label: "iPad 768", width: 768},
    {key: "desktop", label: "Desktop 1280", width: 1280},
];

const ZOOM_PRESETS: number[] = [50, 75, 100];

/** Hard cap on retained console lines — a chatty preview page must not
 *  grow the drawer's memory without bound. Oldest lines drop first. */
const MAX_LOG_LINES = 500;
/** Per-arg display truncation (spec contract for the console drawer). */
const MAX_ARG_CHARS = 300;

/** localStorage key for the per-folder last-chosen entry document. */
const entryStorageKey = (folderSlug: string): string =>
    `${STORAGE_PREFIX}.preview.entry.${folderSlug}`;

// ─── pure helpers ───────────────────────────────────────────────────

type PreviewLogKind = "log" | "warn" | "error";

interface PreviewLogLine {
    id: number;
    kind: PreviewLogKind;
    time: string;
    text: string;
}

let logSeq = 0;

/** Render one console argument as a display string — never evaluates
 *  anything (JSON.stringify with a String() fallback, truncated). */
function formatArg(arg: unknown): string {
    let s: string;
    try {
        s = JSON.stringify(arg) ?? String(arg);
    } catch {
        s = String(arg);
    }
    return s.length > MAX_ARG_CHARS ? `${s.slice(0, MAX_ARG_CHARS)}…` : s;
}

function nowStamp(): string {
    const d = new Date();
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Narrow a posted message body into a console line (null when there is
 *  nothing displayable). Handles all three shapes the injected script
 *  sends: console args, window.onerror, unhandledrejection. */
function logLineFromEvent(data: Record<string, unknown>): PreviewLogLine | null {
    const kind: PreviewLogKind =
        data.kind === "warn" || data.kind === "error" ? data.kind : "log";
    let text = "";
    if (Array.isArray(data.args)) {
        text = data.args.map(formatArg).join(" ");
    } else if (typeof data.message === "string" && data.message.length > 0) {
        const lineno = typeof data.lineno === "number" ? data.lineno : 0;
        const colno = typeof data.colno === "number" ? data.colno : 0;
        text =
            lineno > 0 ? `${data.message} (${lineno}:${colno})` : data.message;
    } else if ("reason" in data) {
        text = `Uncaught (in promise) ${formatArg(data.reason)}`;
    }
    if (!text) return null;
    return {id: ++logSeq, kind, time: nowStamp(), text};
}

function readStoredEntry(folderSlug: string): string | null {
    try {
        return window.localStorage.getItem(entryStorageKey(folderSlug));
    } catch {
        return null; // storage disabled — plain auto-pick every time
    }
}

function writeStoredEntry(folderSlug: string, entry: string): void {
    try {
        window.localStorage.setItem(entryStorageKey(folderSlug), entry);
    } catch {
        /* quota — ignore, next session falls back to auto-pick */
    }
}

/** GET /api/folders → the folder's .html/.htm file list (the "html"
 *  file kind also covers the XML family — match on the extension so
 *  only real documents become preview entries). */
async function fetchHtmlEntries(
    folderSlug: string
): Promise<{ folderName: string; htmlFiles: string[] }> {
    const res = await fetch("/api/folders", {cache: "no-store"});
    if (!res.ok) {
        throw new Error(`Folder listing failed (${res.status}).`);
    }
    const data: unknown = await res.json();
    if (
        !data ||
        typeof data !== "object" ||
        !Array.isArray((data as { folders?: unknown }).folders)
    ) {
        throw new Error("Unexpected folder listing response.");
    }
    const folders = (data as { folders: unknown[] }).folders;
    for (const folder of folders) {
        if (!folder || typeof folder !== "object") continue;
        const fo = folder as Record<string, unknown>;
        if (fo.slug !== folderSlug) continue;
        const files = Array.isArray(fo.files) ? fo.files : [];
        const htmlSet = new Set<string>();
        for (const file of files) {
            if (!file || typeof file !== "object") continue;
            const fi = file as Record<string, unknown>;
            const p =
                typeof fi.path === "string" && fi.path.length > 0
                    ? fi.path
                    : typeof fi.name === "string"
                        ? fi.name
                        : "";
            if (p && /\.html?$/i.test(p)) htmlSet.add(p);
        }
        const htmlFiles = Array.from(htmlSet).sort((a, b) => {
            // index.html leads — it is the conventional entry document.
            const ai = /^index\.html?$/i.test(a) ? 0 : 1;
            const bi = /^index\.html?$/i.test(b) ? 0 : 1;
            if (ai !== bi) return ai - bi;
            return a.localeCompare(b, "en", {sensitivity: "base"});
        });
        return {
            folderName:
                typeof fo.name === "string" && fo.name.length > 0 ? fo.name : folderSlug,
            htmlFiles,
        };
    }
    return {folderName: folderSlug, htmlFiles: []};
}

// ─── component ──────────────────────────────────────────────────────

export interface LivePreviewPanelProps {
    /** True while the Preview tab is the active bottom-panel tab. */
    active: boolean;
    /** URL-safe folder slug (the desluggable base64url form). */
    folderSlug: string;
    /** Host-suggested entry document (relative path in the folder). */
    entryFile?: string;
    /** Currently open editor file name (used as a weaker entry hint). */
    fileName?: string;
}

type WatchState = "off" | "connecting" | "watching" | "error";

export function LivePreviewPanel({
                                     active,
                                     folderSlug,
                                     entryFile,
                                     fileName,
                                 }: LivePreviewPanelProps) {
    const [htmlFiles, setHtmlFiles] = React.useState<string[]>([]);
    const [folderName, setFolderName] = React.useState<string>(folderSlug);
    const [loading, setLoading] = React.useState(true);
    const [listError, setListError] = React.useState<string | null>(null);

    const [entry, setEntry] = React.useState("");
    const [reloadNonce, setReloadNonce] = React.useState(0);

    const [logs, setLogs] = React.useState<PreviewLogLine[]>([]);
    const [consoleOpen, setConsoleOpen] = React.useState(true);

    const [deviceKey, setDeviceKey] = React.useState("responsive");
    const [zoom, setZoom] = React.useState(100);

    const [watchState, setWatchState] = React.useState<WatchState>("off");
    const [flash, setFlash] = React.useState(false);

    const flashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const listRefreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const logBodyRef = React.useRef<HTMLDivElement | null>(null);

    // ── folder listing ────────────────────────────────────────────────
    const fetchList = React.useCallback(async (): Promise<void> => {
        if (!folderSlug) return;
        setLoading(true);
        setListError(null);
        try {
            const list = await fetchHtmlEntries(folderSlug);
            setHtmlFiles(list.htmlFiles);
            setFolderName(list.folderName);
        } catch (err) {
            setListError(
                err instanceof Error ? err.message : "Folder listing failed."
            );
        } finally {
            setLoading(false);
        }
    }, [folderSlug]);

    React.useEffect(() => {
        if (!folderSlug) {
            setHtmlFiles([]);
            setLoading(false);
            return;
        }
        void fetchList();
    }, [folderSlug, fetchList]);

    // ── entry auto-pick ────────────────────────────────────────────────
    // Priority: entryFile prop → localStorage last choice → index.html →
    // the currently open file (when it is html) → first document. The
    // current choice survives listing refreshes while it still exists.
    React.useEffect(() => {
        if (!folderSlug || loading) return;
        if (htmlFiles.length === 0) {
            setEntry("");
            return;
        }
        if (entry && htmlFiles.includes(entry)) return;
        const stored = readStoredEntry(folderSlug);
        const candidate = [entryFile, stored, "index.html", fileName].find(
            (c): c is string =>
                typeof c === "string" && c.length > 0 && htmlFiles.includes(c)
        );
        setEntry(candidate ?? htmlFiles[0]);
    }, [folderSlug, loading, htmlFiles, entry, entryFile, fileName]);

    const handleEntrySelect = (value: string): void => {
        setEntry(value);
        // Remember the user's explicit choice per folder.
        if (folderSlug) writeStoredEntry(folderSlug, value);
    };

    // A new document means a new page — stale console lines would be
    // attributed to the wrong preview.
    React.useEffect(() => {
        setLogs([]);
    }, [folderSlug, entry]);

    // ── console capture (message events from the injected script) ──────
    React.useEffect(() => {
        const onMessage = (event: MessageEvent): void => {
            const data: unknown = event.data;
            if (!data || typeof data !== "object") return;
            const record = data as Record<string, unknown>;
            if (record.source !== "praxis-preview") return;
            const line = logLineFromEvent(record);
            if (!line) return;
            setLogs((prev) => {
                const next = [...prev, line];
                return next.length > MAX_LOG_LINES
                    ? next.slice(next.length - MAX_LOG_LINES)
                    : next;
            });
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    // ── live-reload watcher (status strip + entry list refresh) ────────
    // The iframe's injected script holds its OWN reload connection; this
    // one exists so the panel can flash "changed" and re-list the folder.
    React.useEffect(() => {
        if (!active || !folderSlug) {
            setWatchState("off");
            return;
        }
        const source = new EventSource(
            `/api/preview-stream?folder=${encodeURIComponent(folderSlug)}`
        );
        setWatchState("connecting");
        source.onopen = () => setWatchState("watching");
        source.onerror = () => setWatchState("error"); // EventSource retries
        source.addEventListener("reload", () => {
            setFlash(true);
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
            flashTimerRef.current = setTimeout(() => setFlash(false), 1500);
            // New .html files may have appeared — refresh the dropdown
            // (debounced: editors save in bursts).
            if (listRefreshTimerRef.current) {
                clearTimeout(listRefreshTimerRef.current);
            }
            listRefreshTimerRef.current = setTimeout(() => {
                listRefreshTimerRef.current = null;
                void fetchList();
            }, 500);
        });
        return () => {
            source.close();
            if (flashTimerRef.current) {
                clearTimeout(flashTimerRef.current);
                flashTimerRef.current = null;
            }
            if (listRefreshTimerRef.current) {
                clearTimeout(listRefreshTimerRef.current);
                listRefreshTimerRef.current = null;
            }
        };
    }, [active, folderSlug, fetchList]);

    // ── console auto-scroll ────────────────────────────────────────────
    React.useEffect(() => {
        const el = logBodyRef.current;
        if (!el || !consoleOpen) return;
        el.scrollTop = el.scrollHeight;
    }, [logs, consoleOpen]);

    // ── derived ────────────────────────────────────────────────────────
    const previewUrl =
        entry && folderSlug
            ? `/api/preview?folder=${encodeURIComponent(
                folderSlug
            )}&file=${encodeURIComponent(entry)}`
            : "";
    const errorCount = logs.reduce(
        (n, l) => (l.kind === "error" ? n + 1 : n),
        0
    );
    const deviceWidth =
        DEVICE_PRESETS.find((d) => d.key === deviceKey)?.width ?? null;
    const zoomNum = zoom / 100;

    const dotClass =
        watchState === "watching"
            ? "bg-emerald-500"
            : watchState === "connecting"
                ? "bg-amber-500"
                : watchState === "error"
                    ? "bg-red-500"
                    : "bg-muted-foreground/40";

    const statusText =
        watchState === "off"
            ? "Live reload: paused"
            : watchState === "connecting"
                ? `Live reload: connecting to ${folderName}…`
                : watchState === "watching"
                    ? `Live reload: watching ${folderName}`
                    : "Live reload: connection lost — reconnecting…";

    return (
        <div className="flex h-full min-h-0 flex-col bg-background text-xs">
            {/* ── toolbar: entry select + device presets + zoom + actions ── */}
            <div className="flex flex-wrap items-center gap-2 border-b p-2">
                {loading ? (
                    <Skeleton className="h-8 w-[180px]" aria-label="Loading file list"/>
                ) : htmlFiles.length > 0 ? (
                    <Select value={entry} onValueChange={handleEntrySelect}>
                        <SelectTrigger
                            size="sm"
                            className="min-w-[140px] max-w-[220px] text-xs"
                            aria-label="Preview entry file"
                            title="Entry HTML document"
                        >
                            <SelectValue placeholder="Entry page"/>
                        </SelectTrigger>
                        <SelectContent>
                            {htmlFiles.map((f) => (
                                <SelectItem key={f} value={f} className="text-xs">
                                    {f}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <span className="px-1 text-muted-foreground">No HTML files</span>
                )}

                <div
                    className="flex items-center gap-0.5 rounded-md bg-foreground/5 p-0.5"
                    role="group"
                    aria-label="Device width presets"
                >
                    {DEVICE_PRESETS.map((d) => (
                        <button
                            key={d.key}
                            type="button"
                            onClick={() => setDeviceKey(d.key)}
                            aria-pressed={deviceKey === d.key}
                            title={
                                d.width == null
                                    ? "Fill the available width"
                                    : `${d.width}px viewport width`
                            }
                            className={cn(
                                "rounded px-2 py-0.5 text-[11px] transition-colors",
                                deviceKey === d.key
                                    ? "bg-foreground/15 text-foreground"
                                    : "text-muted-foreground hover:bg-foreground/5"
                            )}
                        >
                            {d.label}
                        </button>
                    ))}
                </div>

                <Select
                    value={String(zoom)}
                    onValueChange={(v) => {
                        const n = Number(v);
                        setZoom(ZOOM_PRESETS.includes(n) ? n : 100);
                    }}
                >
                    <SelectTrigger
                        size="sm"
                        className="w-[74px] text-xs"
                        aria-label="Preview zoom"
                        title="Preview zoom"
                    >
                        <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                        {ZOOM_PRESETS.map((z) => (
                            <SelectItem key={z} value={String(z)} className="text-xs">
                                {z}%
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="ml-auto flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReloadNonce((n) => n + 1)}
                        disabled={!entry}
                        className="h-8 w-8 px-0 hover:bg-foreground/5"
                        aria-label="Reload preview"
                        title="Reload preview"
                    >
                        <RotateCw className="size-3.5"/>
                    </Button>
                    {previewUrl ? (
                        <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 px-0 hover:bg-foreground/5"
                        >
                            <a
                                href={previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Open preview in a new tab"
                                title="Open preview in a new tab"
                            >
                                <ExternalLink className="size-3.5"/>
                            </a>
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled
                            className="h-8 w-8 px-0"
                            aria-label="Open preview in a new tab"
                        >
                            <ExternalLink className="size-3.5"/>
                        </Button>
                    )}
                </div>
            </div>

            {/* ── status strip ── */}
            <div className="flex items-center gap-2 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="relative flex size-2 shrink-0" aria-hidden>
          {watchState === "watching" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"/>
          )}
            <span
                className={cn("relative inline-flex size-2 rounded-full", dotClass)}
            />
        </span>
                <span aria-live="polite" className="min-w-0 truncate">
          {statusText}
        </span>
                {flash && (
                    <Badge
                        variant="secondary"
                        className="animate-pulse px-1.5 py-0 text-[10px]"
                    >
                        changed
                    </Badge>
                )}
                {entry && (
                    <span
                        className="ml-auto hidden max-w-[40%] truncate font-mono text-[10px] text-muted-foreground/70 sm:inline">
            {entry}
          </span>
                )}
            </div>

            {/* ── preview area ── */}
            <div className="flex-1 min-h-0 overflow-auto bg-muted/30 p-4">
                {loading ? (
                    <div className="flex h-full flex-col gap-3" aria-label="Loading preview">
                        <Skeleton className="h-5 w-1/3"/>
                        <Skeleton className="h-full min-h-[120px] w-full"/>
                    </div>
                ) : listError ? (
                    <div
                        className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
                        <TriangleAlert className="size-6 text-amber-500"/>
                        <p className="text-xs text-muted-foreground">{listError}</p>
                        <Button size="sm" variant="outline" onClick={() => void fetchList()}>
                            Retry
                        </Button>
                    </div>
                ) : htmlFiles.length === 0 ? (
                    <div className="flex h-full items-center justify-center p-6">
                        <div className="max-w-sm rounded-lg border bg-background p-6 text-center shadow-sm">
                            <Inbox className="mx-auto size-6 text-muted-foreground"/>
                            <p className="mt-3 text-xs text-muted-foreground">
                                This folder has no HTML files — open a web project folder to
                                preview.
                            </p>
                        </div>
                    </div>
                ) : entry ? (
                    /* Device frame: the outer box reserves deviceWidth×zoom pixels
                       (Responsive reserves 100×zoom% of the panel width); the
                       iframe renders at the NATURAL device width and is scaled —
                       so media queries see the real device width at every zoom. */
                    <div
                        className="mx-auto h-full overflow-hidden rounded-md border bg-background shadow-sm"
                        style={
                            deviceWidth != null
                                ? {width: deviceWidth * zoomNum, maxWidth: "100%"}
                                : {width: `${100 * zoomNum}%`}
                        }
                    >
                        <iframe
                            key={`${folderSlug}::${entry}::${reloadNonce}`}
                            src={previewUrl}
                            title={`Live preview of ${entry}`}
                            /* Deliberately WITHOUT allow-same-origin: the preview page
                               stays inside an opaque origin and can only talk to the
                               host through the postMessage pipe. */
                            sandbox="allow-scripts allow-forms allow-modals allow-popups"
                            className="block origin-top-left bg-white"
                            style={{
                                width: deviceWidth != null ? deviceWidth : `${100 / zoomNum}%`,
                                height: `${100 / zoomNum}%`,
                                transform:
                                    zoomNum === 1 ? undefined : `scale(${zoomNum})`,
                            }}
                        />
                    </div>
                ) : null}
            </div>

            {/* ── console drawer (collapsible, ~40% of the panel) ── */}
            <div
                className="flex min-h-0 flex-col border-t"
                style={consoleOpen ? {height: "40%"} : undefined}
            >
                <div className="flex items-center gap-2 px-3 py-1.5">
                    <Terminal className="size-3.5 shrink-0 text-muted-foreground"/>
                    <span className="text-[11px] font-medium">Console</span>
                    {errorCount > 0 && (
                        <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                            {errorCount} {errorCount === 1 ? "error" : "errors"}
                        </Badge>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLogs([])}
                            disabled={logs.length === 0}
                            className="h-7 w-7 px-0 hover:bg-foreground/5"
                            aria-label="Clear console"
                            title="Clear console"
                        >
                            <Eraser className="size-3.5"/>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConsoleOpen((o) => !o)}
                            className="h-7 w-7 px-0 hover:bg-foreground/5"
                            aria-label={consoleOpen ? "Collapse console" : "Expand console"}
                            title={consoleOpen ? "Collapse console" : "Expand console"}
                        >
                            {consoleOpen ? (
                                <ChevronDown className="size-3.5"/>
                            ) : (
                                <ChevronUp className="size-3.5"/>
                            )}
                        </Button>
                    </div>
                </div>
                {consoleOpen && (
                    <div
                        ref={logBodyRef}
                        role="log"
                        aria-label="Preview console output"
                        className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 font-mono leading-relaxed [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-transparent"
                    >
                        {logs.length === 0 ? (
                            <p className="py-3 text-[11px] italic text-muted-foreground">
                                No console output yet.
                            </p>
                        ) : (
                            logs.map((line) => (
                                <div key={line.id} className="flex items-start gap-2 py-0.5">
                  <span className="mt-0.5 shrink-0" aria-hidden>
                    {line.kind === "error" ? (
                        <CircleAlert className="size-3 text-red-500"/>
                    ) : line.kind === "warn" ? (
                        <TriangleAlert className="size-3 text-amber-500"/>
                    ) : (
                        <Terminal className="size-3 text-muted-foreground/60"/>
                    )}
                  </span>
                                    <span className="shrink-0 tabular-nums text-muted-foreground/70">
                    {line.time}
                  </span>
                                    <span
                                        className={cn(
                                            "min-w-0 flex-1 break-words whitespace-pre-wrap",
                                            line.kind === "error"
                                                ? "text-red-600 dark:text-red-400"
                                                : line.kind === "warn"
                                                    ? "text-amber-600 dark:text-amber-400"
                                                    : "text-muted-foreground"
                                        )}
                                    >
                    {line.text}
                  </span>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
