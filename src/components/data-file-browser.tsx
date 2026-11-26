"use client";

import * as React from "react";
import {Dialog, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {ResizableDialogContent} from "@/components/ui/resizable-dialog";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow,} from "@/components/ui/table";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
    ChevronLeft,
    ChevronRight,
    Database,
    Download,
    FileSpreadsheet,
    FileText,
    Image as ImageIcon,
    RotateCw,
    SquareArrowOutUpRight,
    ZoomIn,
    ZoomOut
} from "lucide-react";
import {cn} from "@/lib/utils";
// FILE-OPEN SPEED: consume the click-time prefetched promise when the
// FileViewer opened this sheet (same URL) instead of re-fetching.
import {dataSheetUrlFor, takePrefetched} from "@/lib/prefetch";
// the client-safe mirror of the server's DataFileInfo (scripts.ts
// pulls node:fs, so it cannot cross the client boundary) — carried
// per entry by /api/folders listings.
import type {DataFileInfo} from "@/lib/data-file-types";
// the column-stats band shared by both table views.
import {ColumnStatsBand, computeStats, computeStatsForValues} from "@/components/column-stats";
// Data-table presentation settings (zebra / colored header / colored
// numbers) — configurable in Settings ▸ Editor ▸ Data file tables.
import {loadSettings} from "@/lib/settings";
// the one-click "install the missing reader dependency" action
import {PipInstallButton} from "@/components/pip-install-button";
import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type SortingState,
    useReactTable,
} from "@tanstack/react-table";

/** Stable per-entry identity. Nested files in DIFFERENT subfolders
 *  can share a basename (two "README.md"s), so selection / thumbnail
 *  maps key by the full relative path when the listing provides it. */
const keyOf = (f: DataFileInfo): string => f.path ?? f.name;

/** /api/data-file URL for an entry — prefers the `file=<slug>` form
 *  (resolves nested files) and falls back to `name=` for root-level
 *  entries from listings that predate the slug field. `extra` is
 *  appended verbatim (e.g. "&download=1"). */
const dataFileUrlFor = (folderSlug: string, f: DataFileInfo, extra = ""): string =>
    f.slug
        ? `/api/data-file?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(f.slug)}${extra}`
        : `/api/data-file?folder=${encodeURIComponent(folderSlug)}&name=${encodeURIComponent(f.name)}${extra}`;

interface DataFileBrowserProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    folderSlug: string;
    folderName: string;
    dataFiles: DataFileInfo[];
    /** "Open in editor" from the preview pane — opens the
     *  file in the main viewer (page resolves the slug). Passes the
     *  WHOLE entry so nested files resolve by slug/path, not just the
     *  collision-prone basename. */
    onOpenInEditor?: (entry: DataFileInfo) => void;
}

interface PreviewResult {
    ok: boolean;
    name: string;
    ext: string;
    size: number;
    contentType: "text" | "binary";
    text?: string;
    truncated?: boolean;
    dataUrl?: string;
    mimeType?: string;
    error?: string;
    /** the addressing slug that fetched this preview (present when
     *  the entry carries one) — lets the preview pane rebuild the
     *  download URL for NESTED files. */
    slug?: string;
    /** the entry's relative path ("Data Files/x.csv"), when known. */
    path?: string;
}

const TEXT_EXTS = new Set([
    ".csv",
    ".tsv",
    ".json",
    ".jsonl",
    ".txt",
    ".md",
    ".yaml",
    ".yml",
    ".toml",
]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

const CSV_PAGE_SIZE = 50;

/** a floating prev/next chevron on the side of the gallery
 *  preview image (lightbox-style) — stays put while the image scrolls
 *  because it hangs on the stage wrapper, not the scroll container. */
function SideArrow({
                       side,
                       disabled,
                       onClick,
                   }: {
    side: "left" | "right";
    disabled?: boolean;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            aria-label={side === "left" ? "Previous image" : "Next image"}
            title={side === "left" ? "Previous image (gallery order)" : "Next image (gallery order)"}
            className={cn(
                "absolute top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30",
                side === "left" ? "left-1.5" : "right-1.5"
            )}
        >
            {side === "left" ? <ChevronLeft className="size-4"/> : <ChevronRight className="size-4"/>}
        </button>
    );
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ==================================================================== */
/*  Data-table presentation (Settings ▸ Editor ▸ Data file tables)      */
/*                                                                      */
/*  Zebra rows, a colored emerald header band and colored numeric cells */
/*  (negatives red / positives green, right-aligned, booleans blue,    */
/* NaN / None gray italics). All three are user-configurable; the */
/*  readers below apply them everywhere the tables render.              */
/* ==================================================================== */

/** Presentation bundle read once per viewer mount (re-read on every */

/*  file switch, so Settings changes apply to the next open).        */
interface DataTableStyle {
    zebra: boolean;
    coloredHeader: boolean;
    coloredNumbers: boolean;
    /** the column-stats band (settings → Editor → Data
     *  file tables, live via the settings-saved event). */
    statsBand: boolean;
}

/** Presentation bundle read per viewer mount AND re-read whenever the
 *  Settings dialog saves (the "praxis:settings-saved" event) — so
 *  toggling zebra / colored header / colored numbers applies to the
 *  ALREADY-OPEN table without a reload or remount. */
function useDataTableStyle(): DataTableStyle {
    const [style, setStyle] = React.useState<DataTableStyle>(() => readTableStyle());
    React.useEffect(() => {
        const onChanged = () => setStyle(readTableStyle());
        window.addEventListener("praxis:settings-saved", onChanged);
        return () => window.removeEventListener("praxis:settings-saved", onChanged);
    }, []);
    return style;
}

function readTableStyle(): DataTableStyle {
    try {
        const s = loadSettings();
        return {
            zebra: s.dataTableZebra,
            coloredHeader: s.dataTableColoredHeader,
            coloredNumbers: s.dataTableColoredNumbers,
            statsBand: s.dataTableStatsBand !== false,
        };
    } catch {
        return {zebra: true, coloredHeader: true, coloredNumbers: true, statsBand: true};
    }
}

/* ==================================================================== */
/* the slideshow config bundle — read from Settings and */
/* re-read on every "praxis:settings-saved" so interval / transition / */
/* loop changes apply to an open gallery immediately.                  */

/* ==================================================================== */

interface SlideshowStyle {
    intervalSeconds: number;
    transition: "none" | "fade" | "slide";
    loop: boolean;
    autoStart: boolean;
}

function readSlideshowStyle(): SlideshowStyle {
    try {
        const s = loadSettings();
        return {
            intervalSeconds: Math.max(1, Math.min(60, s.slideshowIntervalSeconds ?? 3)),
            transition: s.slideshowTransition ?? "fade",
            loop: s.slideshowLoop !== false,
            autoStart: s.slideshowAutoStart === true,
        };
    } catch {
        return {intervalSeconds: 3, transition: "fade", loop: true, autoStart: false};
    }
}

function useSlideshowStyle(): SlideshowStyle {
    const [style, setStyle] = React.useState<SlideshowStyle>(() => readSlideshowStyle());
    React.useEffect(() => {
        const onChanged = () => setStyle(readSlideshowStyle());
        window.addEventListener("praxis:settings-saved", onChanged);
        return () => window.removeEventListener("praxis:settings-saved", onChanged);
    }, []);
    return style;
}

/** Cell value classification for coloring. */
type CellClass =
    | "negative" // red
    | "positive" // green
    | "boolean" // blue
    | "boolean-false" // orange
    | "missing" // gray italic (NaN / None / null)
    | null; // default text

/** Classify a CSV-ish STRING cell (also used for string values coming
 *  out of pandas: "3.14", "-2", "1,234.5", "NaN", "True"…). */
function classifyTextCell(s: string): CellClass {
    const t = s.trim();
    if (!t) return null;
    // Empty-ish / missing sentinels.
    if (/^(?:nan|NaN|NAN|none|None|null|NULL|-{1,2}|—|N\/A|n\/a)$/.test(t)) return "missing";
    // Booleans (Excel / pandas stringified bools).
    if (t === "True" || t === "true" || t === "TRUE") return "boolean";
    if (t === "False" || t === "false" || t === "FALSE") return "boolean-false";
    // Numeric (allow thousands separators + scientific notation).
    const num = t.replace(/,/g, "");
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(num)) {
        const n = Number(num);
        if (!Number.isFinite(n)) return "missing";
        if (n < 0) return "negative";
        if (n > 0) return "positive";
        return null; // zero — default color
    }
    return null;
}

/** Classify a typed sheet value (number / boolean / null / string). */
function classifyValue(v: unknown): CellClass {
    if (v === null || v === undefined) return "missing";
    if (typeof v === "number") {
        if (Number.isNaN(v)) return "missing";
        if (v < 0) return "negative";
        if (v > 0) return "positive";
        return null;
    }
    if (typeof v === "boolean") return v ? "boolean" : "boolean-false";
    if (typeof v === "string") return classifyTextCell(v);
    return null;
}

/** Tailwind classes for a classified cell. */
const CELL_CLASS: Record<Exclude<CellClass, null>, string> = {
    negative: "text-red-600 dark:text-red-400 tabular-nums",
    positive: "text-emerald-600 dark:text-emerald-400 tabular-nums",
    boolean: "text-sky-600 dark:text-sky-400",
    "boolean-false": "text-orange-600 dark:text-orange-400",
    missing: "text-muted-foreground italic",
};

/** Render a table cell's content with the right classes.
 *  `numericColumn` right-aligns cells in numeric columns (the column
 *  dtypes say int/float, or a CSV column scanned as numeric). */
function renderStyledCell(value: React.ReactNode, cls: CellClass, numericColumn: boolean): React.ReactNode {
    return cls ? (
        <span className={cn(CELL_CLASS[cls], numericColumn && "block text-right")}>
      {value}
    </span>
    ) : numericColumn ? (
        <span className="block text-right tabular-nums">{value}</span>
    ) : (
        value
    );
}

/** Is this pandas dtype numeric? (int* / uint* / float* / complex*) */
function isNumericDtype(dtype: string | undefined): boolean {
    if (!dtype) return false;
    return /^(?:int|uint|float|complex)\d*/.test(dtype.trim());
}

/** Detect numeric CSV columns from a sample of parsed rows (≥90% of
 *  non-empty cells parse as numbers). Cheap: scans at most 100 rows. */
function detectNumericColumns(parsed: ParsedCsv | null): boolean[] {
    if (!parsed || parsed.rows.length === 0) return [];
    const sample = parsed.rows.slice(0, 100);
    return parsed.headers.map((_, i) => {
        let numeric = 0;
        let filled = 0;
        for (const row of sample) {
            const cell = row[i];
            if (cell === undefined || cell.trim() === "") continue;
            filled++;
            const c = classifyTextCell(cell);
            if (c === "negative" || c === "positive" || c === null && isFiniteNumber(cell)) numeric++;
        }
        return filled > 0 && numeric / filled >= 0.9;
    });
}

function isFiniteNumber(s: string): boolean {
    const t = s.trim().replace(/,/g, "");
    return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(t) && Number.isFinite(Number(t));
}

/** Header-row classes — emerald accent band when colored headers are on. */
function dataTableHeaderCls(st: DataTableStyle): string {
    return cn(
        "sticky top-0 z-10",
        st.coloredHeader
            ? "bg-emerald-500/10 dark:bg-emerald-500/15 border-b border-emerald-500/30"
            : "bg-muted/40"
    );
}

/** Row classes — zebra striping keyed by the ORIGINAL row index. */
function dataTableRowCls(st: DataTableStyle, index: number): string {
    return st.zebra && index % 2 === 1 ? "bg-muted/25 hover:bg-muted/50" : "hover:bg-muted/40";
}

/**
 * Parse a single CSV line into fields, honoring double-quoted fields
 * (with `""` escaping embedded quotes). Uses a regex that matches either a
 * quoted field or an unquoted field, separated by commas. Returns null on
 * failure so the caller can fall back to a raw <pre> view.
 */
function parseCsvLine(line: string): string[] | null {
    const fields: string[] = [];
    const regex = /(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g;
    let match: RegExpExecArray | null;
    try {
        while ((match = regex.exec(line)) !== null) {
            if (match[1] !== undefined) {
                fields.push(match[1].replace(/""/g, '"'));
            } else {
                fields.push(match[2] ?? "");
            }
            // Guard against zero-width matches causing an infinite loop.
            if (match.index === regex.lastIndex) regex.lastIndex++;
        }
    } catch {
        return null;
    }
    return fields;
}

interface ParsedCsv {
    headers: string[];
    rows: string[][];
}

/**
 * Parse CSV text into headers + rows. Returns null if the input is empty or
 * malformed (caller falls back to raw view).
 */
function parseCsv(text: string): ParsedCsv | null {
    const lines = text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n");
    // Drop trailing blank lines but keep interior ones.
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    if (lines.length === 0) return null;

    const headerRow = parseCsvLine(lines[0]);
    if (!headerRow) return null;
    const headers = headerRow.map((h, i) => h || `Column ${i + 1}`);

    const rows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "") continue;
        const parsed = parseCsvLine(line);
        if (!parsed) return null;
        rows.push(parsed);
    }
    return {headers, rows};
}

/**
 * — binary spreadsheet viewer (.xlsx /.xls /.parquet /
 *.feather). The browser cannot parse these natively, so the preview is
 * read server-side by /api/data-sheet (a fixed pandas reader) and
 * rendered in the same sortable, paginated table the CSV viewer uses.
 * Workbooks list their sheets in a selector row.
 *
 * the viewer is now EXPORTED so
 * the FileViewer can reuse it when the user opens a spreadsheet from
 * the file tree. Two addressing forms:
 * - `name` — plain root filename (DataFileBrowser usage).
 * - `fileSlug` — base64url slug of the relative path INSIDE the
 * folder, so NESTED spreadsheets ("data/raw/s.xlsx") open too.
 */
export function SheetDataView({
                                  folderSlug,
                                  name,
                                  fileSlug,
                                  title,
                                  fontScale = 1,
                              }: {
    folderSlug: string;
    name: string;
    fileSlug?: string;
    /** Display-only override for the loading line. */
    title?: string;
    /** The viewer toolbar's zoom multiplier — scales the sheet's
     * table text (the viewer “zoom in.csv/.xlsx not working” fix). */
    fontScale?: number;
}) {
    const [sheet, setSheet] = React.useState("");
    const [data, setData] = React.useState<{
        sheets: string[];
        sheet: string;
        engine: string;
        columns: string[];
        dtypes: string[];
        rows: unknown[][];
        totalRows: number;
    } | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [hint, setHint] = React.useState<string | null>(null);
    // The MISSING-PACKAGE story
    // pandas was missing while the loaded env HAD it): the route now
    // returns the bare `missing` name + the interpreter it actually
    // spawned, and this card grows an "Install X & retry" button that
    // runs pip INTO THE CONFIGURED ENV and then RE-FETCHES the preview
    // automatically — no manual reopen needed.
    const [missingPkg, setMissingPkg] = React.useState<string | null>(null);
    const [usedInterpreter, setUsedInterpreter] = React.useState<string | null>(null);
    const [installNonce, setInstallNonce] = React.useState(0);
    const [loading, setLoading] = React.useState(true);
    const [sorting, setSorting] = React.useState<SortingState>([]);
    // the missing-value column filter.
    const [missingFilter, setMissingFilter] = React.useState<number | null>(null);

    React.useEffect(() => {
        setMissingFilter(null);
    }, [sheet, fileSlug, name]);

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setHint(null);
        setMissingPkg(null);
        setUsedInterpreter(null);
        void (async () => {
            try {
                // installNonce > 0 means this load is a RETRY after an install
                // (or a manual Retry click): the URL gains a cache-buster so
                // neither the prefetch map nor the browser HTTP cache can serve
                // the OLD "missing package" error back — the reader re-runs and
                // the NEXT missing package (if any) is reported in place,
                // without a page refresh
                // missing package it does not retry to report that; it required
                // me to refresh the page").
                const url =
                    installNonce > 0
                        ? `${dataSheetUrlFor(folderSlug, {fileSlug, name, sheet})}&_r=${installNonce}`
                        : dataSheetUrlFor(folderSlug, {fileSlug, name, sheet});
                // FILE-OPEN SPEED: reuse the in-flight prefetch promise when one
                // exists (the FileViewer's click handler starts it) — but never
                // on a retry (different URL above).
                const res = await (installNonce > 0
                    ? fetch(url, {cache: "no-store"})
                    : (takePrefetched(url) ?? fetch(url)));
                const json = await res.json();
                if (cancelled) return;
                if (!res.ok || !json.ok) {
                    setError(json.error ?? `HTTP ${res.status}`);
                    setHint(json.hint ?? null);
                    // Prefer the route's explicit field; fall back to parsing the
                    // message (older responses / proxy caches).
                    const fromField = typeof json.missing === "string" ? json.missing : null;
                    const fromMessage = /missing the "([A-Za-z0-9_.-]+)" package/.exec(String(json.error ?? ""))?.[1] ?? null;
                    setMissingPkg(fromField ?? fromMessage);
                    setUsedInterpreter(typeof json.interpreter === "string" ? json.interpreter : null);
                    setData(null);
                } else {
                    setMissingPkg(null);
                    setUsedInterpreter(null);
                    setData(json);
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
    }, [folderSlug, name, fileSlug, sheet, installNonce]);

    const tableStyle = useDataTableStyle();

    const columns = React.useMemo<ColumnDef<unknown[]>[]>(() => {
        if (!data) return [];
        return data.columns.map((h, i) => {
            const numericCol = isNumericDtype(data.dtypes?.[i]);
            return {
                id: `col_${i}`,
                accessorFn: (row: unknown[]) => row[i] ?? null,
                header: `${h}${data.dtypes?.[i] ? ` (${data.dtypes[i]})` : ""}`,
                meta: {numericCol},
                cell: (info) => {
                    const v = info.getValue();
                    if (v === null || v === undefined || v === "") {
                        return renderStyledCell("—", tableStyle.coloredNumbers ? "missing" : null, false);
                    }
                    const cls = tableStyle.coloredNumbers ? classifyValue(v) : null;
                    return renderStyledCell(String(v), cls, numericCol);
                },
            };
        });
    }, [data, tableStyle]);

    const table = useReactTable<unknown[]>({
        data:
            data && missingFilter !== null
                ? data.rows.filter((row) => {
                    const cell = row[missingFilter];
                    return cell === null || cell === undefined || String(cell).trim() === "";
                })
                : (data?.rows ?? []),
        columns,
        state: {sorting},
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: {pagination: {pageSize: 20}},
        // keep the page index when the page size changes.
        autoResetPageIndex: false,
    });

    //
    // selectable records-per-page — updates both the React mirror and
    // the tanstack table.
    const [pageSize, setPageSizeState] = React.useState(20);
    const setPageSize = (n: number) => {
        setPageSizeState(n);
        table.setPageSize(n);
    };

    if (loading) {
        // table-shaped skeleton instead of a bare spinner line —
        // mimics the header row + data rows that are about to land so the
        // layout doesn't jump when the data arrives.
        return (
            <div className="space-y-2" aria-busy="true" aria-label={`Reading ${title ?? name}…`}>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileSpreadsheet className="size-3.5 text-emerald-500"/>
                    <span>Reading {title ?? name} with pandas…</span>
                </div>
                <div className="border rounded-md overflow-hidden">
                    <div className="flex gap-2 px-3 py-2 border-b bg-muted/40">
                        {Array.from({length: 6}).map((_, i) => (
                            <div key={i} className="h-3 rounded bg-muted animate-pulse flex-1"/>
                        ))}
                    </div>
                    {Array.from({length: 8}).map((_, r) => (
                        <div key={r} className="flex gap-2 px-3 py-2 border-b last:border-b-0">
                            {Array.from({length: 6}).map((_, c) => (
                                <div
                                    key={c}
                                    className="h-3 rounded bg-muted/70 animate-pulse flex-1"
                                    style={{animationDelay: `${(r * 6 + c) * 60}ms`}}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    if (error) {
        return (
            <div className="space-y-2 py-4">
                <p className="text-xs text-red-500">{error}</p>
                {hint && <p className="text-xs text-amber-500">{hint}</p>}
                {missingPkg && (
                    <div className="flex flex-wrap items-center gap-2">
                        <PipInstallButton
                            module={missingPkg}
                            label={`Install ${missingPkg} & retry`}
                            onInstalled={() => {
                                // the button installs into the CONFIGURED env; the nonce
                                // bump re-runs the load effect above (it is in the
                                // effect's dependency array) → the preview refreshes
                                // itself and the NEXT missing package, if any, is
                                // reported in place — no manual reopen / page refresh.
                                setInstallNonce((n) => n + 1);
                            }}
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => setInstallNonce((n) => n + 1)}
                            title="Re-read the sheet right now (e.g. after installing the package elsewhere) — the card shows its loading skeleton while it re-reads"
                        >
                            <RotateCw className="size-3.5"/> Retry
                        </Button>
                    </div>
                )}
                {usedInterpreter && (
                    <p className="text-[10px] text-muted-foreground break-all">
                        Reader environment: <span className="font-mono">{usedInterpreter}</span>
                        {missingPkg && " — the Install button targets the environment selected in Settings ▸ Python runtime."}
                    </p>
                )}
            </div>
        );
    }
    if (!data) return null;

    // stats + missing filter for typed sheets.
    const stats = computeStatsForValues(data.columns, data.rows);
    const sheetRows =
        missingFilter === null
            ? data.rows
            : data.rows.filter((row) => {
                const cell = row[missingFilter];
                return cell === null || cell === undefined || String(cell).trim() === "";
            });

    return (
        <div className="space-y-2" style={{fontSize: "12px", zoom: fontScale === 1 ? undefined : fontScale}}>
            {/* Sheet tabs (workbooks only) + engine badge */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <FileSpreadsheet className="size-3.5 text-emerald-500"/>
                {data.sheets.length > 0 ? (
                    data.sheets.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setSheet(s)}
                            className={cn(
                                "px-2 py-0.5 rounded text-[11px] border",
                                (data.sheet || data.sheets[0]) === s
                                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "border-border hover:bg-muted/50"
                            )}
                        >
                            {s}
                        </button>
                    ))
                ) : (
                    <Badge variant="secondary" className="text-[10px] font-mono">
                        {data.engine}
                    </Badge>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground">
          {(missingFilter === null ? data.totalRows : sheetRows.length).toLocaleString()} rows × {data.columns.length} cols
                    {missingFilter === null && data.totalRows > data.rows.length &&
                        ` (showing first ${data.rows.length})`}
        </span>
            </div>

            {tableStyle.statsBand && (
                <ColumnStatsBand
                    stats={stats}
                    missingFilter={missingFilter}
                    onToggleMissing={(index) => setMissingFilter((cur) => (cur === index ? null : index))}
                />
            )}

            <div className="rounded-md border overflow-auto max-h-[50vh]">
                <Table style={{fontSize: "inherit"}}>
                    <TableHeader className={dataTableHeaderCls(tableStyle)}>
                        {table.getHeaderGroups().map((hg) => (
                            <TableRow key={hg.id}>
                                {hg.headers.map((header) => {
                                    const numericCol = (header.column.columnDef.meta as {
                                        numericCol?: boolean
                                    } | undefined)?.numericCol === true;
                                    return (
                                        <TableHead
                                            key={header.id}
                                            className={cn(
                                                "cursor-pointer select-none whitespace-nowrap",
                                                tableStyle.coloredHeader &&
                                                "text-emerald-700 dark:text-emerald-300",
                                                numericCol && tableStyle.coloredNumbers && "text-right"
                                            )}
                                            onClick={header.column.getToggleSortingHandler()}
                                        >
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                            {{asc: " ↑", desc: " ↓"}[header.column.getIsSorted() as string] ?? ""}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.map((row) => (
                            <TableRow key={row.id} className={dataTableRowCls(tableStyle, row.index)}>
                                {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id}
                                               className="font-mono whitespace-nowrap max-w-[24rem] truncate">
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground"
                       title="How many records each page displays">
                    Rows / page
                    <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="h-6 rounded-md border bg-background px-1 text-[11px]"
                        aria-label="Records per page"
                    >
                        {[10, 20, 50, 100, 200, 500].map((n) => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </label>
                <span className="text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
                    {Math.max(1, table.getPageCount())}
        </span>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                >
                    Prev
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                >
                    Next
                </Button>
            </div>
        </div>
    );
}

/**
 * exported so the FileViewer can render the
 * SAME sortable / paginated table for .csv / .tsv files opened from
 * the file tree — the content is already fetched as text there
 * (2 ms via /api/file), so the preview is instant and needs no
 * Python. (DataFileBrowser itself keeps its own usage.)
 */
export function CsvTableView({
                                 text,
                                 truncated,
                                 fontScale = 1,
                             }: {
    text: string;
    truncated?: boolean;
    /** The viewer toolbar's zoom multiplier — scales the table (and the
     *  raw fallback) so “zoom in .csv” actually works in view mode. */
    fontScale?: number;
}) {
    const [viewRaw, setViewRaw] = React.useState(false);
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const tableStyle = useDataTableStyle();
    // column-stats band + the missing-value filter.
    const [missingFilter, setMissingFilter] = React.useState<number | null>(null);

    const parsed = React.useMemo(() => parseCsv(text), [text]);
    //
    // (Page 1 of 6 Prev Next)"): the page size used to be the fixed
    // CSV_PAGE_SIZE constant (50) — now a selectable records-per-page.
    const [pageSize, setPageSizeState] = React.useState(CSV_PAGE_SIZE);
    // Numeric-column detection (colored-number alignment) — cheap scan
    // of at most the first 100 rows.
    const numericCols = React.useMemo(() => detectNumericColumns(parsed), [parsed]);
    const stats = React.useMemo(
        () => (parsed ? computeStats(parsed.headers, parsed.rows) : []),
        [parsed]
    );

    const columns = React.useMemo<ColumnDef<string[]>[]>(() => {
        if (!parsed) return [];
        return parsed.headers.map((h, i) => ({
            id: `col_${i}`,
            accessorFn: (row: string[]) => row[i] ?? "",
            header: h,
            meta: {numericCol: numericCols[i] === true},
            cell: (info) => {
                const v = (info.getValue() as string) ?? "";
                const cls = tableStyle.coloredNumbers ? classifyTextCell(v) : null;
                return renderStyledCell(v, cls, numericCols[i] === true);
            },
        }));
    }, [parsed, numericCols, tableStyle]);

    const rawData = React.useMemo<string[][]>(() => {
        if (!parsed) return [];
        // the missing-filter hides every row that HAS a
        // value in the picked column (shows only rows missing it).
        if (missingFilter === null) return parsed.rows;
        return parsed.rows.filter((row) => {
            const cell = (row[missingFilter] ?? "").trim();
            return cell === "" || cell === "NaN" || cell === "None" || cell === "null";
        });
    }, [parsed, missingFilter]);

    const table = useReactTable<string[]>({
        data: rawData,
        columns,
        state: {sorting},
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: {pagination: {pageSize: CSV_PAGE_SIZE}},
        // keep the page index when the page size changes
        // (setPageSize clamps it) instead of resetting to page 0.
        autoResetPageIndex: false,
    });

    // the imperative page-size setter — updates BOTH the
    // React mirror (used for the row-count band) and the table itself.
    const setPageSize = (n: number) => {
        setPageSizeState(n);
        table.setPageSize(n);
    };

    const renderPre = (extra?: React.ReactNode) => (
        <div className="space-y-2" style={{fontSize: "12px", zoom: fontScale === 1 ? undefined : fontScale}}>
            {extra}
            <pre
                className="font-mono whitespace-pre-wrap break-words bg-background rounded-md p-3 max-h-[50vh] overflow-auto">
        {text}
      </pre>
            {truncated && (
                <p className="text-xs text-amber-500">Showing the first 1 MB of this file — download it for the full
                    content.</p>
            )}
        </div>
    );

    // Fall back silently to <pre> if parsing failed.
    if (!parsed) {
        return renderPre();
    }

    if (viewRaw) {
        return renderPre(
            <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setViewRaw(false)}>
                    View table
                </Button>
            </div>
        );
    }

    const pageIndex = table.getState().pagination.pageIndex;
    const start = rawData.length === 0 ? 0 : pageIndex * pageSize + 1;
    const end = Math.min((pageIndex + 1) * pageSize, rawData.length);
    const pageCount = table.getPageCount();

    return (
        <div className="space-y-2" style={{fontSize: "12px", zoom: fontScale === 1 ? undefined : fontScale}}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">
          Showing {start}-{end} of {rawData.length} rows
            {missingFilter !== null ? ` · missing-col filter ON (col ${missingFilter + 1})` : ""}
            {pageCount > 1 ? ` · page ${pageIndex + 1}/${pageCount}` : ""}
        </span>
                <div className="flex items-center gap-1.5">
                    {missingFilter !== null && (
                        <Button size="sm" variant="outline" onClick={() => setMissingFilter(null)}
                                title="Clear the missing-value filter">
                            Clear filter
                        </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setViewRaw(true)}>
                        View raw
                    </Button>
                </div>
            </div>
            {tableStyle.statsBand && (
                <ColumnStatsBand
                    stats={stats}
                    missingFilter={missingFilter}
                    onToggleMissing={(index) =>
                        setMissingFilter((cur) => (cur === index ? null : index))
                    }
                />
            )}
            <div className="border rounded-md overflow-auto max-h-[50vh]">
                <Table style={{fontSize: "inherit"}}>
                    <TableHeader className={dataTableHeaderCls(tableStyle)}>
                        {table.getHeaderGroups().map((hg) => (
                            <TableRow key={hg.id}>
                                {hg.headers.map((header) => {
                                    const sorted = header.column.getIsSorted();
                                    const numericCol = (header.column.columnDef.meta as {
                                        numericCol?: boolean
                                    } | undefined)?.numericCol === true;
                                    return (
                                        <TableHead
                                            key={header.id}
                                            onClick={header.column.getToggleSortingHandler()}
                                            className={cn(
                                                "cursor-pointer select-none whitespace-nowrap hover:bg-muted/60",
                                                tableStyle.coloredHeader &&
                                                "text-emerald-700 dark:text-emerald-300",
                                                numericCol && tableStyle.coloredNumbers && "text-right"
                                            )}
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                                                <span className="text-muted-foreground text-[10px]">
                          {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
                        </span>
                                            </div>
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.length === 0 ? (
                            <TableRow>
                                <TableCell className="text-xs text-muted-foreground text-center py-4">
                                    No rows.
                                </TableCell>
                            </TableRow>
                        ) : (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id} className={dataTableRowCls(tableStyle, row.index)}>
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell
                                            key={cell.id}
                                            className="font-mono whitespace-nowrap"
                                        >
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
            {pageCount > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        Prev
                    </Button>
                    <span className="text-xs text-muted-foreground">
            Page {pageIndex + 1} of {pageCount}
          </span>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        Next
                    </Button>
                    {/* records-per-page — how many rows each page shows. */}
                    <label className="ml-2 flex items-center gap-1 text-[11px] text-muted-foreground"
                           title="How many records each page displays">
                        Rows / page
                        <select
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            className="h-6 rounded-md border bg-background px-1 text-[11px]"
                            aria-label="Records per page"
                        >
                            {[10, 20, 50, 100, 200, 500].map((n) => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </label>
                </div>
            )}
            {rawData.length > 10 && pageCount <= 1 && (
                /* Few enough rows to fit one page at the CURRENT size — still
        let the user shrink / grow the page (e.g. show 10 at a time
        inside a short pane). */
                <div className="flex items-center justify-center gap-2">
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground"
                           title="How many records each page displays">
                        Rows / page
                        <select
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            className="h-6 rounded-md border bg-background px-1 text-[11px]"
                            aria-label="Records per page"
                        >
                            {[10, 20, 50, 100, 200, 500].map((n) => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </label>
                </div>
            )}
            {truncated && (
                <p className="text-xs text-amber-500">Showing the first 1 MB of this file — download it for the full
                    content.</p>
            )}
        </div>
    );
}

/**
 * Pretty-printable JSON view. Shows a "Format JSON" toggle that re-indents
 * the content with 2 spaces; keeps the <pre> layout (no table). If the
 * content isn't valid JSON (e.g. truncated), the toggle is hidden and the
 * raw text is shown as-is.
 */
function JsonTextView({text, truncated}: { text: string; truncated?: boolean }) {
    const [formatted, setFormatted] = React.useState(false);

    const canFormat = React.useMemo(() => {
        try {
            JSON.parse(text);
            return true;
        } catch {
            return false;
        }
    }, [text]);

    const display = React.useMemo(() => {
        if (!formatted || !canFormat) return text;
        try {
            return JSON.stringify(JSON.parse(text), null, 2);
        } catch {
            return text;
        }
    }, [formatted, canFormat, text]);

    return (
        <div className="space-y-2">
            {canFormat && (
                <div className="flex justify-end">
                    <Button
                        size="sm"
                        variant={formatted ? "secondary" : "outline"}
                        onClick={() => setFormatted((v) => !v)}
                    >
                        {formatted ? "Format JSON ✓" : "Format JSON"}
                    </Button>
                </div>
            )}
            <pre
                className="font-mono text-xs whitespace-pre-wrap break-words bg-background rounded-md p-3 max-h-[50vh] overflow-auto">
        {display}
      </pre>
            {truncated && (
                <p className="text-xs text-amber-500">Showing the first 1 MB of this file — download it for the full
                    content.</p>
            )}
        </div>
    );
}

/**
 * Modal that lists all non-Python data files (CSV, JSON, parquet, images,
 * etc.) in a folder and previews them inline. Image files are shown as a
 * thumbnail grid at the top of the file list; other files use the classic
 * list layout. CSV files render as a sortable, paginated table; JSON files
 * get a pretty-print toggle; other text files render as a monospaced block;
 * images render as <img>; other binary files just show metadata.
 */
export function DataFileBrowser({
                                    open,
                                    onOpenChange,
                                    folderSlug,
                                    folderName,
                                    dataFiles,
                                    onOpenInEditor,
                                }: DataFileBrowserProps) {
    const [selected, setSelected] = React.useState<string | null>(null);
    const [preview, setPreview] = React.useState<PreviewResult | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [thumbs, setThumbs] = React.useState<Record<string, string | undefined>>({});
    /** measured natural dimensions per image ("W×H" strings)
     *  — shown on the gallery tile hover overlay; measured once when the
     *  thumbnails finish loading. */
    const [imgDims, setImgDims] = React.useState<Record<string, string | undefined>>({});
    /** gallery preview controls — zoom + rotation for the
     *  selected image, plus prev/next navigation among the images. */
    const [imgZoom, setImgZoom] = React.useState(1);
    const [imgRotation, setImgRotation] = React.useState(0);
    /** Fit / Fill — the preview's zoom mode. "fit" shows the
     *  whole image inside the pane (contain); "fill" scales it to cover
     *  the pane (crop). Persists across selection changes (it is a
     *  viewing preference, not per-image state) and applies during the
     *  slideshow too. */
    const [imgMode, setImgMode] = React.useState<"fit" | "fill">("fit");
    /* slideshow (interval/transition/loop come from
      * Settings → View) + gallery sort / extension filter / thumbnail
      * size — all local to the browser dialog. */
    const slideshow = useSlideshowStyle();
    const [slideshowOn, setSlideshowOn] = React.useState(false);
    const [gallerySort, setGallerySort] = React.useState<"name" | "recent" | "size">("name");
    const [galleryFilter, setGalleryFilter] = React.useState<string>("all");
    const [thumbCols, setThumbCols] = React.useState<3 | 4 | 5>(4);

    React.useEffect(() => {
        if (!open) {
            setSelected(null);
            setPreview(null);
            setThumbs({});
            setImgDims({});
            setImgZoom(1);
            setImgRotation(0);
            setImgMode("fit");
            setSlideshowOn(false);
        }
    }, [open]);

    /** Reset the image preview controls whenever the selection moves. */
    React.useEffect(() => {
        setImgZoom(1);
        setImgRotation(0);
    }, [selected]);

    React.useEffect(() => {
        if (!selected || !folderSlug) return;
        // image previews reuse the already-downloaded
        // thumbnail instead of re-fetching the identical file from
        // /api/data-file a second time (the thumbnail grid already pulled
        // every image when the dialog opened).
        const fileMeta = dataFiles.find((f) => keyOf(f) === selected);
        if (fileMeta && IMAGE_EXTS.has(fileMeta.ext) && thumbs[selected]) {
            // Reset any loading state left over from a superseded fetch.
            setLoading(false);
            setPreview({
                ok: true,
                name: fileMeta.name,
                ext: fileMeta.ext,
                size: fileMeta.size,
                contentType: "binary",
                dataUrl: thumbs[selected],
                slug: fileMeta.slug,
                path: fileMeta.path,
            });
            return;
        }
        let cancelled = false;
        setLoading(true);
        setPreview(null);
        if (!fileMeta) {
            setLoading(false);
            return;
        }
        // the slug form (`file=`) resolves NESTED data files; the plain
        // name form only reaches the folder root.
        fetch(dataFileUrlFor(folderSlug, fileMeta))
            .then((r) => r.json())
            .then((data: PreviewResult) => {
                if (!cancelled) setPreview({...data, slug: fileMeta.slug, path: fileMeta.path});
            })
            .catch((err) => {
                if (!cancelled) {
                    setPreview({
                        ok: false,
                        name: fileMeta.name,
                        ext: "",
                        size: 0,
                        contentType: "text",
                        error: (err as Error).message,
                        slug: fileMeta.slug,
                        path: fileMeta.path,
                    });
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [selected, folderSlug, thumbs, dataFiles]);

    const imageFiles = React.useMemo(
        () => dataFiles.filter((f) => IMAGE_EXTS.has(f.ext)),
        [dataFiles]
    );
    /* the gallery list — extension-filtered and sorted
      * (name / most-recent / largest). Drives the thumbnail grid, the
      * prev/next buttons AND the slideshow so they always agree. */
    const galleryImages = React.useMemo(() => {
        const exts = new Set(imageFiles.map((f) => f.ext.toLowerCase()));
        const filtered =
            galleryFilter === "all" || !exts.has(galleryFilter.toLowerCase())
                ? imageFiles
                : imageFiles.filter((f) => f.ext.toLowerCase() === galleryFilter.toLowerCase());
        const sorted = [...filtered];
        if (gallerySort === "recent") sorted.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
        else if (gallerySort === "size") sorted.sort((a, b) => b.size - a.size);
        else sorted.sort((a, b) => a.name.localeCompare(b.name));
        return sorted;
    }, [imageFiles, gallerySort, galleryFilter]);
    const galleryExts = React.useMemo(
        () => [...new Set(imageFiles.map((f) => f.ext.toLowerCase()))].sort(),
        [imageFiles]
    );
    const nonImageFiles = React.useMemo(
        () => dataFiles.filter((f) => !IMAGE_EXTS.has(f.ext)),
        [dataFiles]
    );
    /* the slideshow heartbeat — advance through the
      * gallery every configured interval; stop at the end when looping
      * is off; auto-stop when the gallery empties or the dialog closes. */
    React.useEffect(() => {
        if (!open || !slideshowOn || galleryImages.length < 2) return;
        const id = window.setInterval(() => {
            setSelected((cur) => {
                const idx = galleryImages.findIndex((f) => keyOf(f) === cur);
                if (idx < 0) return cur;
                if (idx >= galleryImages.length - 1) {
                    if (slideshow.loop) return keyOf(galleryImages[0]);
                    setSlideshowOn(false); // reached the end, loop is off
                    return cur;
                }
                return keyOf(galleryImages[idx + 1]);
            });
        }, Math.max(1, slideshow.intervalSeconds) * 1000);
        return () => window.clearInterval(id);
    }, [open, slideshowOn, galleryImages, slideshow.intervalSeconds, slideshow.loop]);

    /* auto-start — with "Slideshow — auto-start" on, the
      * show begins the moment the gallery opens (the heartbeat above
      * guards <2 images, so this can stay simple). */
    React.useEffect(() => {
        if (open && slideshow.autoStart) setSlideshowOn(true);
    }, [open, slideshow.autoStart]);

    // Lazily fetch thumbnail data URLs for all image files when the modal
    // opens. We re-use the same /api/data-file endpoint — for typical folder
    // images (PNG/JPG/SVG previews) this is cheap enough. `thumbs[key]` is
    // `undefined` while loading, `""` if the fetch failed, or the data URL;
    // keys are the entry's path (nested files can share a basename).
    React.useEffect(() => {
        if (!open || !folderSlug || imageFiles.length === 0) return;
        let cancelled = false;

        Promise.all(
            imageFiles.map(async (f) => {
                try {
                    const r = await fetch(dataFileUrlFor(folderSlug, f));
                    const data: PreviewResult = await r.json();
                    return {key: keyOf(f), dataUrl: data.dataUrl ?? ""};
                } catch {
                    return {key: keyOf(f), dataUrl: ""};
                }
            })
        ).then((results) => {
            if (cancelled) return;
            setThumbs((prev) => {
                const next = {...prev};
                for (const r of results) {
                    next[r.key] = r.dataUrl;
                }
                return next;
            });
            // measure each image's natural dimensions once (for
            // the tile hover overlay + the preview header). Cheap — the
            // data URLs are already in memory, and decode is async.
            for (const r of results) {
                if (!r.dataUrl) continue;
                const img = new Image();
                img.onload = () => {
                    setImgDims((prev) =>
                        prev[r.key]
                            ? prev
                            : {...prev, [r.key]: `${img.naturalWidth}×${img.naturalHeight}`}
                    );
                };
                img.src = r.dataUrl;
            }
        });

        return () => {
            cancelled = true;
        };
    }, [open, folderSlug, imageFiles]);

    const isCsv = preview?.ext === ".csv";
    const isJson = preview?.ext === ".json";
    // binary spreadsheets get the pandas-backed table.
    const isSheet =
        !!preview &&
        [".xlsx", ".xls", ".parquet", ".feather"].includes(preview.ext);
    /** the entry behind the current selection — drives the preview
     *  pane's action buttons (open-in-editor / download) so NESTED
     *  files address by slug, and the preview skeleton's shape. */
    const selectedEntry = React.useMemo(
        () => (selected ? dataFiles.find((f) => keyOf(f) === selected) ?? null : null),
        [selected, dataFiles]
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <ResizableDialogContent id="data-file-browser" defaultW={940} defaultH={660}
                                    className="overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Database className="size-4 text-emerald-500"/>
                        Data Files In {folderName}
                    </DialogTitle>
                    <DialogDescription>
                        Non-Python files in this folder. Click a row to preview.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 flex-1 min-h-0">
                    {/* File list */}
                    <div className="rounded-md border overflow-auto max-h-[60vh]">
                        {dataFiles.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-6">
                                No data files in this folder.
                            </p>
                        ) : (
                            <>
                                {imageFiles.length > 0 && (
                                    <div className="p-2">
                                        {/* gallery controls — sort, extension
                        filter and thumbnail size for the image grid. */}
                                        <div className="flex flex-wrap items-center gap-1 px-1 pb-1.5 text-[10px]">
                                            <span className="text-muted-foreground uppercase tracking-wide font-medium">Images ({galleryImages.length}/{imageFiles.length})</span>
                                            <span className="flex-1"/>
                                            <select
                                                value={gallerySort}
                                                onChange={(e) => setGallerySort(e.target.value as "name" | "recent" | "size")}
                                                className="h-5 rounded border bg-background px-1 text-[10px]"
                                                aria-label="Sort gallery"
                                                title="Sort the gallery"
                                            >
                                                <option value="name">A→Z</option>
                                                <option value="recent">Recent</option>
                                                <option value="size">Largest</option>
                                            </select>
                                            {galleryExts.length > 1 && (
                                                <select
                                                    value={galleryFilter}
                                                    onChange={(e) => setGalleryFilter(e.target.value)}
                                                    className="h-5 rounded border bg-background px-1 text-[10px]"
                                                    aria-label="Filter by extension"
                                                    title="Filter by extension"
                                                >
                                                    <option value="all">all</option>
                                                    {galleryExts.map((e) => (
                                                        <option key={e} value={e}>{e.replace(".", "")}</option>
                                                    ))}
                                                </select>
                                            )}
                                            <div className="flex items-center rounded border overflow-hidden">
                                                {([5, 4, 3] as const).map((c) => (
                                                    <button
                                                        key={c}
                                                        type="button"
                                                        onClick={() => setThumbCols(c)}
                                                        className={cn("px-1 py-0 text-[10px] leading-4", thumbCols === c ? "bg-emerald-500/20 font-medium" : "hover:bg-muted")}
                                                        title={c === 5 ? "Small thumbnails" : c === 4 ? "Medium thumbnails" : "Large thumbnails"}
                                                    >
                                                        {c === 5 ? "S" : c === 4 ? "M" : "L"}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div
                                            className={cn(
                                                /* GALLERY OVERLAP FIX: gutters now scale with the
                                                   S/M/L density (S tight → L roomy) so every
                                                   thumbnail keeps clear space between its
                                                   neighbours in all three grid sizes. */
                                                thumbCols === 5
                                                    ? "grid grid-cols-5 gap-1.5"
                                                    : thumbCols === 4
                                                        ? "grid grid-cols-4 gap-2"
                                                        : "grid grid-cols-3 gap-2.5"
                                            )}
                                        >
                                            {galleryImages.map((f) => {
                                                const fKey = keyOf(f);
                                                const isSelected = selected === fKey;
                                                const thumb = thumbs[fKey];
                                                const dims = imgDims[fKey];
                                                return (
                                                    /* the tile is a div (not a <button>) so
                                                                                the hover overlay can contain a real download
                                                                                <a> — nesting interactive elements inside a
                                                                                <button> is invalid HTML and breaks a11y. */
                                                    <div
                                                        key={fKey}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => setSelected(fKey)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" || e.key === " ") {
                                                                e.preventDefault();
                                                                setSelected(fKey);
                                                            }
                                                        }}
                                                        /* TOOLTIP FIX: the tile's title carries the COMPLETE
                                                                                   file identity (sub-folder path when the file
                                                                                   is nested, plain name at the folder root) —
                                                                                   the visible label truncates with ellipsis in
                                                                                   every grid size (S/M/L), so the tooltip is
                                                                                   the only place the full name always reads. */
                                                        title={f.path ?? f.name}
                                                        className={cn(
                                                            "group/tile relative flex flex-col items-center gap-1 rounded-md border text-left transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                                            /* inner padding scales with S/M/L too —
                                                               S stays compact, L gets breathing room
                                                               around the thumbnail and its label. */
                                                            thumbCols === 5 ? "p-1" : thumbCols === 4 ? "p-1.5" : "p-2",
                                                            isSelected
                                                                ? "border-emerald-500 bg-emerald-500/10"
                                                                : "border-transparent hover:bg-muted/50"
                                                        )}
                                                    >
                                                        <div
                                                            /* FLUID THUMB FIX: the thumbnail box now
                                                               fills its grid cell (w-full + square)
                                                               instead of a fixed 48/64/96px square.
                                                               The fixed sizes exceeded the narrow
                                                               sidebar cells, and because the box was
                                                               shrink-0 the images bled over their
                                                               neighbours — the reported overlap in
                                                               every S/M/L size. Fluid sizing can never
                                                               exceed the cell, so the overlap is
                                                               structurally impossible now. */
                                                            className="relative w-full aspect-square rounded bg-muted/40 overflow-hidden flex items-center justify-center"
                                                            title={f.path ?? f.name}
                                                        >
                                                            {thumb === undefined ? (
                                                                /* Skeleton tile — pulsing shimmer, no
                                spinner. */
                                                                <div
                                                                    className="w-full h-full bg-muted animate-pulse rounded"/>
                                                            ) : thumb === "" ? (
                                                                <ImageIcon className="size-4 text-muted-foreground"/>
                                                            ) : (
                                                                <img
                                                                    src={thumb}
                                                                    alt={f.name}
                                                                    title={f.path ?? f.name}
                                                                    /* fills the fluid thumb box — no fixed
                                                                       pixel sizes left in the grid. */
                                                                    className="h-full w-full object-cover"
                                                                    loading="lazy"
                                                                />
                                                            )}
                                                            {/* per-tile hover overlay — file name
                                  + dimensions (when measured) + a download
                                  icon button. */}
                                                            <div
                                                                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center gap-1 bg-background/85 px-1.5 py-1 opacity-0 backdrop-blur-sm transition-opacity group-hover/tile:opacity-100">
                                <span
                                    className="min-w-0 flex-1 truncate font-mono text-[9px] leading-none text-foreground/90"
                                    title={f.path ?? f.name}
                                >
                                  {f.name}
                                </span>
                                                                {dims && (
                                                                    <span
                                                                        className="shrink-0 font-mono text-[9px] leading-none tabular-nums text-muted-foreground">
                                    {dims}
                                  </span>
                                                                )}
                                                                <a
                                                                    href={dataFileUrlFor(folderSlug, f, "&download=1")}
                                                                    download={f.name}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="pointer-events-auto flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                    title={`Download ${f.path ?? f.name}`}
                                                                    aria-label={`Download ${f.name}`}
                                                                >
                                                                    <Download className="size-3"/>
                                                                </a>
                                                            </div>
                                                        </div>
                                                        <span
                                                            className="text-[10px] font-mono truncate w-full text-center text-foreground/80"
                                                            title={f.path ?? f.name}
                                                        >
                              {f.name}
                            </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {imageFiles.length > 0 && nonImageFiles.length > 0 && (
                                    <div className="h-px bg-border mx-3 my-1"/>
                                )}

                                {nonImageFiles.length > 0 && (
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-muted/40 z-10">
                                            <TableRow>
                                                <TableHead className="text-xs">Name</TableHead>
                                                <TableHead className="text-xs text-right">Size</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {nonImageFiles.map((f) => (
                                                <TableRow
                                                    key={keyOf(f)}
                                                    onClick={() => setSelected(keyOf(f))}
                                                    className="cursor-pointer"
                                                    data-selected={selected === keyOf(f)}
                                                >
                                                    <TableCell className="text-xs font-mono py-1.5">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <FileText
                                                                className="size-3 shrink-0 text-muted-foreground"/>
                                                            <span className="truncate" title={f.path ?? f.name}>
                                {f.name}
                              </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell
                                                        className="text-xs text-right text-muted-foreground py-1.5">
                                                        {formatSize(f.size)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </>
                        )}
                    </div>

                    {/* Preview pane */}
                    <div className="rounded-md border overflow-auto max-h-[60vh] p-3 bg-muted/20">
                        {!selected && (
                            <p className="text-xs text-muted-foreground text-center py-12">
                                Select a file on the left to preview it.
                            </p>
                        )}
                        {selected && loading && (
                            /* TYPE-AWARE preview skeleton: the placeholder
              now mimics what the selected file is about to render —
              a shimmering square for images, a header row + data
              rows for spreadsheets / CSV, indented text lines for
              everything else. No spinner anywhere. */
                            <div className="space-y-3" role="status" aria-live="polite"
                                 aria-label="Loading file preview">
                                <span className="sr-only">Loading preview…</span>
                                {(() => {
                                    const selExt = dataFiles.find((f) => keyOf(f) === selected)?.ext ?? "";
                                    const isImageSel = IMAGE_EXTS.has(selExt);
                                    const isTableSel =
                                        selExt === ".csv" || selExt === ".tsv" ||
                                        [".xlsx", ".xls", ".parquet", ".feather"].includes(selExt);
                                    if (isImageSel) {
                                        return (
                                            <div
                                                className="rounded-md bg-background p-3 flex items-center justify-center">
                                                <div
                                                    className="w-full max-w-md aspect-video rounded-lg bg-muted animate-pulse"/>
                                            </div>
                                        );
                                    }
                                    if (isTableSel) {
                                        return (
                                            <div className="rounded-md bg-background p-3">
                                                <div className="border rounded-md overflow-hidden">
                                                    <div className="flex gap-2 px-3 py-2 border-b bg-muted/40">
                                                        {Array.from({length: 6}).map((_, i) => (
                                                            <div key={i}
                                                                 className="h-3 rounded bg-muted animate-pulse flex-1"
                                                                 style={{animationDelay: `${i * 70}ms`}}/>
                                                        ))}
                                                    </div>
                                                    {Array.from({length: 8}).map((_, r) => (
                                                        <div key={r}
                                                             className="flex gap-2 px-3 py-2 border-b last:border-b-0">
                                                            {Array.from({length: 6}).map((_, c) => (
                                                                <div key={c}
                                                                     className="h-3 rounded bg-muted/70 animate-pulse flex-1"
                                                                     style={{animationDelay: `${(r * 6 + c) * 60}ms`}}/>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div className="rounded-md bg-background p-3 max-h-[50vh] overflow-hidden">
                                            {Array.from({length: 10}).map((_, i) => (
                                                <div
                                                    key={i}
                                                    className="h-3 bg-muted rounded animate-pulse mb-2"
                                                    style={{width: `${52 + ((i * 37) % 42)}%`}}
                                                />
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                        {selected && preview && !loading && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Badge
                                        variant="outline"
                                        className="font-mono text-[10px] max-w-full"
                                        title={selectedEntry?.path ?? preview.name}
                                    >
                                        {selectedEntry?.path ?? preview.name}
                                    </Badge>
                                    <Badge variant="secondary" className="text-[10px]">
                                        {preview.ext}
                                    </Badge>
                                    <Badge variant="secondary" className="text-[10px]">
                                        {formatSize(preview.size)}
                                    </Badge>
                                    {preview.contentType === "binary" && (
                                        <Badge variant="outline" className="text-[10px]">
                                            {preview.mimeType ?? "binary"}
                                        </Badge>
                                    )}
                                    <span className="flex-1"/>
                                    {/* gallery actions — open in the main viewer /
                      download; image zoom + rotate + prev/next live below
                      the image itself. */}
                                    {onOpenInEditor && selectedEntry && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 gap-1 text-[10px]"
                                            onClick={() => onOpenInEditor(selectedEntry)}
                                            title="Open this file in the main viewer (full toolbox / editor)"
                                        >
                                            <SquareArrowOutUpRight className="size-3"/> Open in editor
                                        </Button>
                                    )}
                                    {selectedEntry && (
                                        <a
                                            href={dataFileUrlFor(folderSlug, selectedEntry, "&download=1")}
                                            download={preview.name}
                                            className="inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[10px] hover:bg-muted"
                                            title="Download this file"
                                        >
                                            <Download className="size-3"/> Download
                                        </a>
                                    )}
                                </div>

                                {preview.error ? (
                                    <p className="text-xs text-red-500">{preview.error}</p>
                                ) : isSheet ? (
                                    // the slug form addresses NESTED spreadsheets; the
                                    // plain name reaches only folder-root files.
                                    <SheetDataView
                                        folderSlug={folderSlug}
                                        name={preview.name}
                                        fileSlug={selectedEntry?.slug}
                                    />
                                ) : isCsv && preview.contentType === "text" && preview.text ? (
                                    <CsvTableView text={preview.text} truncated={preview.truncated}/>
                                ) : isJson && preview.contentType === "text" && preview.text ? (
                                    <JsonTextView text={preview.text} truncated={preview.truncated}/>
                                ) : preview.contentType === "text" && preview.text ? (
                                    <>
                    <pre
                        className="font-mono text-xs whitespace-pre-wrap break-words bg-background rounded-md p-3 max-h-[50vh] overflow-auto">
                      {preview.text}
                    </pre>
                                        {preview.truncated && (
                                            <p className="text-xs text-amber-500">
                                                Output truncated at 200 KB.
                                            </p>
                                        )}
                                    </>
                                ) : preview.dataUrl ? (
                                    <div className="space-y-1.5">
                                        {/* image preview controls — zoom presets,
                        rotation, prev/next among the folder's images.
 Fit / Fill zoom-mode toggle + side
                        arrows on the image itself (below). */}
                                        {(() => {
                                            const gIdx = galleryImages.findIndex((f) => keyOf(f) === selected);
                                            const goPrev = () => {
                                                if (gIdx > 0) setSelected(keyOf(galleryImages[gIdx - 1]));
                                            };
                                            const goNext = () => {
                                                if (gIdx >= 0 && gIdx < galleryImages.length - 1) setSelected(keyOf(galleryImages[gIdx + 1]));
                                            };
                                            return (
                                                <div className="flex items-center gap-1 flex-wrap">
                                                    {/* Fit / Fill — the zoom mode for the
                          preview (and the slideshow while it advances).
                          Fit = contain the whole image; Fill = cover the
                          pane (crops the overflow). */}
                                                    <div className="flex items-center rounded border overflow-hidden"
                                                         role="group" aria-label="Zoom mode">
                                                        {(["fit", "fill"] as const).map((m) => (
                                                            <button
                                                                key={m}
                                                                type="button"
                                                                onClick={() => setImgMode(m)}
                                                                className={cn(
                                                                    "px-1.5 py-0 text-[10px] leading-5",
                                                                    imgMode === m ? "bg-emerald-500/20 font-medium" : "hover:bg-muted"
                                                                )}
                                                                title={m === "fit" ? "Fit — show the whole image inside the pane" : "Fill — cover the pane (crops the overflow)"}
                                                            >
                                                                {m === "fit" ? "Fit" : "Fill"}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <Button variant="ghost" size="sm" className="h-6 px-1.5"
                                                            onClick={() => setImgZoom((z) => Math.max(0.25, z / 1.25))}
                                                            title="Zoom out">
                                                        <ZoomOut className="size-3"/>
                                                    </Button>
                                                    <span
                                                        className="text-[10px] font-mono w-10 text-center">{Math.round(imgZoom * 100)}%</span>
                                                    <Button variant="ghost" size="sm" className="h-6 px-1.5"
                                                            onClick={() => setImgZoom((z) => Math.min(8, z * 1.25))}
                                                            title="Zoom in">
                                                        <ZoomIn className="size-3"/>
                                                    </Button>
                                                    <Button variant="ghost" size="sm" className="h-6 px-1.5"
                                                            onClick={() => setImgZoom(1)}
                                                            title="Reset zoom to 100%">100%</Button>
                                                    <Button variant="ghost" size="sm" className="h-6 px-1.5"
                                                            onClick={() => setImgRotation((r) => (r + 90) % 360)}
                                                            title="Rotate 90°">
                                                        <RotateCw className="size-3"/>
                                                    </Button>
                                                    <span className="flex-1"/>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 px-1.5"
                                                        disabled={gIdx <= 0}
                                                        onClick={goPrev}
                                                        title="Previous image in the gallery"
                                                    >
                                                        <ChevronLeft className="size-3"/>
                                                    </Button>
                                                    <span className="text-[10px] text-muted-foreground tabular-nums">
                        {gIdx + 1} / {galleryImages.length}
                      </span>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 px-1.5"
                                                        disabled={gIdx >= galleryImages.length - 1}
                                                        onClick={goNext}
                                                        title="Next image in the gallery"
                                                    >
                                                        <ChevronRight className="size-3"/>
                                                    </Button>
                                                </div>
                                            );
                                        })()}
                                        {/* the image stage — relative wrapper so the
                        prev/next side arrows can float over the image
                        (lightbox-style) without scrolling away. */}
                                        <div className="relative">
                                            <div
                                                className="max-h-[50vh] overflow-auto grid place-items-center bg-[repeating-conic-gradient(hsl(var(--muted)/.15)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] rounded-md">
                                                <img
                                                    src={preview.dataUrl}
                                                    alt={preview.name}
                                                    title={selectedEntry?.path ?? preview.name}
                                                    className={cn(
                                                        "rounded shadow-sm transition-transform",
                                                        imgMode === "fill" ? "w-full h-[50vh] object-cover" : "max-w-none"
                                                    )}
                                                    style={{
                                                        transform: `rotate(${imgRotation}deg) scale(${imgZoom})`,
                                                        ...(imgMode === "fit"
                                                            ? {
                                                                maxHeight: imgZoom === 1 ? "50vh" : undefined,
                                                                width: imgZoom === 1 ? "auto" : undefined,
                                                                maxWidth: imgZoom === 1 ? "100%" : undefined,
                                                            }
                                                            : {}),
                                                    }}
                                                />
                                            </div>
                                            {galleryImages.length > 1 && (
                                                <>
                                                    <SideArrow
                                                        side="left"
                                                        disabled={galleryImages.findIndex((f) => keyOf(f) === selected) <= 0}
                                                        onClick={() => {
                                                            const gIdx = galleryImages.findIndex((f) => keyOf(f) === selected);
                                                            if (gIdx > 0) setSelected(keyOf(galleryImages[gIdx - 1]));
                                                        }}
                                                    />
                                                    <SideArrow
                                                        side="right"
                                                        disabled={galleryImages.findIndex((f) => keyOf(f) === selected) >= galleryImages.length - 1}
                                                        onClick={() => {
                                                            const gIdx = galleryImages.findIndex((f) => keyOf(f) === selected);
                                                            if (gIdx >= 0 && gIdx < galleryImages.length - 1) setSelected(keyOf(galleryImages[gIdx + 1]));
                                                        }}
                                                    />
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        No inline preview available for this file type.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </ResizableDialogContent>
        </Dialog>
    );
}
