"use client";

import * as React from "react";
import {ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet, Sigma,} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow,} from "@/components/ui/table";
import {cn} from "@/lib/utils";
import {ColumnStatsBand, computeStatsForValues} from "@/components/column-stats";
import {toCsvText} from "@/lib/csv-io";
import {isMissingValue, matchesCellFilter, type VariableGridPayload,} from "@/lib/console-variable-grid";
import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type SortingState,
    useReactTable,
} from "@tanstack/react-table";

/**
 * VariableGridDialog — the console's "open in grid" viewer.
 *
 * Renders one VariableGridPayload (fetched live from the kernel by the
 * console panel through /api/console/variable) in the SAME grid look
 * the app already uses for .csv/.xlsx files (SheetDataView / CsvGridEditor
 * pattern): sortable columns with ↑/↓ markers, sticky header, monospace
 * nowrap cells, zebra rows, a rows-per-page selector and Prev/Next
 * pagination — plus, on top of sort + pagination:
 *
 *   - a per-column FILTER row (substring, case-insensitive; numeric
 *     columns also accept >, <, >=, <=, = and inclusive ranges like
 *     10..20, and a "missing" query for empty cells —
 *     lib/console-variable-grid's matchesCellFilter), all client-side
 *     over the rows the dialog already holds;
 *   - a Stats toggle that turns on the SAME column-stats band the CSV /
 *     Excel views use (min / max / mean / sum / unique / missing for
 *     the current filtered view; the missing badge doubles as a
 *     missing-only column filter);
 *   - an Export CSV button downloading the CURRENT filtered + sorted
 *     view via lib/csv-io (RFC 4180 quoting) — only the loaded rows of
 *     a truncated snapshot, labeled as such.
 *
 * Read-only by design — the data is a SNAPSHOT of a live kernel object,
 * so saving it back would be a lie; the caps note says exactly what was
 * truncated.
 *
 * Two mounts:
 *   1. Directly by the console panel (its own fallback viewer — works
 *      with zero page wiring).
 *   2. By page.tsx through <VariableGridDialogHost /> — a tiny host that
 *      listens for the PRAXIS_OPEN_VARIABLE_GRID CustomEvent (detail
 *      {columns, rows, title}) and calls preventDefault() so the
 *      console panel knows the page took over and skips its own dialog.
 */

export interface VariableGridDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The grid payload to render (null + open = nothing renders). */
    data: VariableGridPayload | null;
}

/** Missing-value marker, matching SheetDataView's cells. */
const MISSING = "—";

/** Compare two unknown cells for column sorting — numbers numerically,
 * nulls LAST (they read as pandas' NaN), everything else by string. */
function cellCompare(a: unknown, b: unknown): number {
    const aMissing = a === null || a === undefined || a === "";
    const bMissing = b === null || b === undefined || b === "";
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1; // missing sorts last regardless of direction
    if (bMissing) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    const an = typeof a === "boolean" ? Number(a) : Number(a);
    const bn = typeof b === "boolean" ? Number(b) : Number(b);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return String(a).localeCompare(String(b));
}

/** One grid cell as display text. */
function cellText(v: unknown): string {
    if (v === null || v === undefined || v === "") return MISSING;
    if (typeof v === "boolean") return v ? "True" : "False";
    return String(v);
}

/** Download file name for a grid export — sanitized viewer title +
 *  the exported row count (so a truncated export is self-describing). */
function gridExportFileName(title: string, rowCount: number): string {
    const safe =
        title.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") ||
        "grid";
    return `praxis-${safe}-${rowCount}rows.csv`;
}

export function VariableGridDialog({open, onOpenChange, data}: VariableGridDialogProps) {
    const [sorting, setSorting] = React.useState<SortingState>([]);
    // Pagination is FULLY CONTROLLED state (not initialState): a new
    // payload resets the view — sorting/page-size/page pointed at the
    // previous object's columns — and the table follows because it
    // reads `state`, never its own mirror.
    const [pagination, setPagination] = React.useState({
        pageIndex: 0,
        pageSize: 50,
    });
    // ── the FILTER ROW's state: one query per column index (substring
    // match / numeric comparators / ranges — see matchesCellFilter) plus
    // the column-stats band's missing-only filter. Filtering is purely
    // client-side over the rows the dialog already holds.
    const [columnFilters, setColumnFilters] = React.useState<Record<number, string>>({});
    const [missingFilter, setMissingFilter] = React.useState<number | null>(null);
    const [showStats, setShowStats] = React.useState(false);

    // A new payload resets the view state.
    React.useEffect(() => {
        setSorting([]);
        setPagination({pageIndex: 0, pageSize: 50});
        setColumnFilters({});
        setMissingFilter(null);
        setShowStats(false);
    }, [data]);

    const columns = React.useMemo<ColumnDef<unknown[]>[]>(() => {
        if (!data) return [];
        return data.columns.map((h, i) => ({
            id: `col_${i}`,
            accessorFn: (row: unknown[]) => row[i] ?? null,
            header: h,
            cell: (info) => cellText(info.getValue()),
            sortingFn: (a, b, columnId) => {
                // tanstack hands us row models; compare the raw cell values.
                const idx = Number(String(columnId).slice("col_".length));
                return cellCompare(a.original[idx], b.original[idx]);
            },
        }));
    }, [data]);

    // The active per-column queries (empty strings are no-ops).
    const activeFilterEntries = React.useMemo(() => {
        const out: [number, string][] = [];
        for (const key of Object.keys(columnFilters)) {
            const idx = Number(key);
            const q = columnFilters[idx];
            if (typeof q === "string" && q.trim() !== "") out.push([idx, q]);
        }
        return out;
    }, [columnFilters]);
    const filtersActive = activeFilterEntries.length > 0 || missingFilter != null;

    // The filtered view — computed BEFORE the table so sorting and
    // pagination ride the filtered set (and the export reads the same
    // rows the user sees). Client-side only; never materializes more
    // than the dialog already holds.
    const filteredRows = React.useMemo(() => {
        const rows = data?.rows ?? [];
        if (!filtersActive) return rows;
        return rows.filter((row) => {
            if (missingFilter != null && !isMissingValue(row[missingFilter])) return false;
            for (const [idx, q] of activeFilterEntries) {
                if (!matchesCellFilter(row[idx], q)) return false;
            }
            return true;
        });
    }, [data, filtersActive, activeFilterEntries, missingFilter]);

    // Column stats for the CURRENT filtered view (min / max / mean / sum /
    // unique / missing per column) — computed only while the Stats
    // toggle is on.
    const stats = React.useMemo(
        () => (showStats && data ? computeStatsForValues(data.columns, filteredRows) : []),
        [showStats, data, filteredRows]
    );

    const table = useReactTable<unknown[]>({
        data: filteredRows,
        columns,
        state: {sorting, pagination},
        onSortingChange: setSorting,
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        autoResetPageIndex: false,
    });

    const pageSize = pagination.pageSize;
    const setPageSize = (n: number) => {
        setPagination((p) => ({pageIndex: p.pageIndex, pageSize: n}));
    };

    /** Update one column's filter query (snapping back to page 1 — a
     *  narrower view can leave the old page index past the end). */
    const setColumnFilter = (index: number, value: string) => {
        setColumnFilters((prev) => ({...prev, [index]: value}));
        setPagination((p) => ({...p, pageIndex: 0}));
    };

    const clearFilters = () => {
        setColumnFilters({});
        setMissingFilter(null);
        setPagination((p) => ({...p, pageIndex: 0}));
    };

    /** Export the CURRENT filtered + sorted view as CSV. csv-io's
     *  stringify does the RFC 4180 quoting (commas / quotes / newlines in
     *  cells); the download mechanism is the app-standard Blob + object
     *  URL + anchor click (run-history / duckdb-workbench pattern).
     *  Only the rows the dialog already holds are exported — a
     *  truncated kernel snapshot exports its loaded rows and is labeled
     *  as such; nothing ever fetches more from the kernel. */
    const handleExportCsv = () => {
        if (!data) return;
        const view = table.getSortedRowModel().rows.map((row) => row.original);
        const csv = toCsvText(data.columns, view);
        const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = gridExportFileName(data.title, view.length);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const shownRows = data ? data.rows.length : 0;
    const truncatedRows =
        data && typeof data.totalRows === "number" ? Math.max(0, data.totalRows - shownRows) : 0;
    const truncatedCols =
        data && typeof data.totalCols === "number"
            ? Math.max(0, data.totalCols - data.columns.length)
            : 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col gap-3">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                        <FileSpreadsheet className="size-4 text-emerald-500" aria-hidden/>
                        <span className="font-mono">{data?.title ?? "variable"}</span>
                        {data?.kind && (
                            <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                                {data.kind}
                            </Badge>
                        )}
                        <span className="text-xs font-normal text-muted-foreground">
              {filtersActive
                  ? `${filteredRows.length.toLocaleString()} of ${shownRows.toLocaleString()} rows`
                  : `${shownRows.toLocaleString()} rows`}{" "}
                            × {data?.columns.length ?? 0} cols
            </span>
                    </DialogTitle>
                    <DialogDescription>
                        Live snapshot from the console kernel — read-only.{" "}
                        {truncatedRows > 0 || truncatedCols > 0 ? (
                            <>
                                Showing the first {shownRows.toLocaleString()} of{" "}
                                {(data?.totalRows ?? 0).toLocaleString()} rows
                                {truncatedCols > 0
                                    ? ` and ${data?.columns.length ?? 0} of ${data?.totalCols ?? 0} columns`
                                    : ""}
                                ; slice the object in the console for more.
                            </>
                        ) : (
                            "Full object."
                        )}
                    </DialogDescription>
                </DialogHeader>

                {/* Column stats (the Stats toggle) — the SAME band the CSV /
            Excel sheet views use, computed over the current FILTERED
            view. Its missing badge doubles as a missing-only column
            filter wired into the filter row's machinery. */}
                {showStats && data && (
                    <ColumnStatsBand
                        stats={stats}
                        missingFilter={missingFilter}
                        onToggleMissing={(i) => {
                            setMissingFilter((cur) => (cur === i ? null : i));
                            setPagination((p) => ({...p, pageIndex: 0}));
                        }}
                    />
                )}

                <div
                    className="min-h-0 flex-1 overflow-auto rounded-md border max-h-[60vh]"
                    style={{fontSize: "12px"}}
                >
                    <Table style={{fontSize: "inherit"}}>
                        <TableHeader>
                            {table.getHeaderGroups().map((hg) => (
                                <TableRow key={hg.id}>
                                    {hg.headers.map((header) => (
                                        <TableHead
                                            key={header.id}
                                            className="cursor-pointer select-none whitespace-nowrap bg-muted/80"
                                            onClick={header.column.getToggleSortingHandler()}
                                            aria-label={`Sort by column ${header.id}`}
                                        >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === "asc" ? (
                              <ArrowUp className="size-2.5 text-muted-foreground" aria-hidden/>
                          ) : header.column.getIsSorted() === "desc" ? (
                              <ArrowDown className="size-2.5 text-muted-foreground" aria-hidden/>
                          ) : (
                              <ArrowUpDown className="size-2.5 text-muted-foreground/40" aria-hidden/>
                          )}
                      </span>
                                        </TableHead>
                                    ))}
                                </TableRow>
                            ))}
                            {/* The per-column FILTER row — one input per column.
                  Substring match (case-insensitive); numeric columns
                  accept >, <, >=, <=, = and ranges (10..20); 'missing'
                  matches empty cells. */}
                            <TableRow>
                                {(data?.columns ?? []).map((h, i) => (
                                    <TableHead
                                        key={`filter-col-${i}`}
                                        className="h-8 border-t bg-muted/40 p-1"
                                    >
                                        <input
                                            type="text"
                                            value={columnFilters[i] ?? ""}
                                            onChange={(e) => setColumnFilter(i, e.target.value)}
                                            placeholder="Filter"
                                            aria-label={`Filter column ${h}`}
                                            title="Substring match (case-insensitive). Numeric columns also accept >, <, >=, <=, = and ranges like 10..20 — or 'missing' for empty cells."
                                            className="h-6 w-full min-w-16 rounded-md border bg-background px-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        />
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        className="py-6 text-center text-muted-foreground"
                                        colSpan={Math.max(1, data?.columns.length ?? 1)}
                                    >
                                        {filtersActive ? "No rows match the current filters." : "No rows."}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow key={row.id} className="even:bg-muted/25">
                                        {row.getVisibleCells().map((cell) => {
                                            const v = cell.getValue();
                                            return (
                                                <TableCell
                                                    key={cell.id}
                                                    className={cn(
                                                        "font-mono whitespace-nowrap max-w-[24rem] truncate",
                                                        (v === null || v === undefined || v === "") && "text-muted-foreground/50",
                                                        typeof v === "number" && "text-right tabular-nums"
                                                    )}
                                                    title={cellText(v)}
                                                >
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Toolbar (Stats toggle + CSV export + match count) with the
            SheetDataView rows-per-page + Prev/Next pagination on the
            right. */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 px-2 text-xs"
                            aria-pressed={showStats}
                            onClick={() => setShowStats((s) => !s)}
                            title="Per-column min / max / mean / sum / unique / missing for the current filtered view"
                        >
                            <Sigma className="size-3" aria-hidden/>
                            Stats
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 px-2 text-xs"
                            onClick={handleExportCsv}
                            disabled={!data}
                            title="Download the current filtered and sorted view as CSV (RFC 4180 quoting)"
                        >
                            <Download className="size-3" aria-hidden/>
                            Export CSV
                        </Button>
                        {filtersActive && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {filteredRows.length.toLocaleString()} of {shownRows.toLocaleString()} rows match
                <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={clearFilters}
                >
                  clear
                </button>
              </span>
                        )}
                        {truncatedRows > 0 && (
                            <span
                                className="text-[11px] text-muted-foreground"
                                title="The kernel snapshot is truncated — the export covers the loaded rows only"
                            >
                export: loaded rows only
              </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label
                            className="flex items-center gap-1 text-[11px] text-muted-foreground"
                            title="How many records each page displays"
                        >
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
            </DialogContent>
        </Dialog>
    );
}

/**
 * VariableGridDialogHost — page-level mount for the grid viewer.
 *
 * Listens for the PRAXIS_OPEN_VARIABLE_GRID window CustomEvent (detail:
 * {columns, rows, title, kind?, totalRows?, totalCols?, expr?}) and opens
 * the dialog. It calls preventDefault() on the event, which is the
 * console panel's signal that the page took over rendering — so with
 * this host mounted, the panel never opens its own fallback dialog.
 *
 * Wiring (page.tsx, near the diff-view surface mount):
 *   import { VariableGridDialogHost } from "@/components/variable-grid-dialog";
 *   …render once, e.g. right after the <DiffView …/> block in the
 *   `diffView ? ( … ) : codeLoading ? ( … )` editor-surface chain.
 */
export function VariableGridDialogHost() {
    const [payload, setPayload] = React.useState<VariableGridPayload | null>(null);

    React.useEffect(() => {
        const onGrid = (e: Event) => {
            const d = (e as CustomEvent).detail as VariableGridPayload | undefined;
            // Ignore malformed events, but still claim them (preventDefault) so
            // a broken dispatcher doesn't double-render the console's dialog.
            e.preventDefault();
            if (
                !d ||
                !Array.isArray(d.columns) ||
                !d.columns.every((c) => typeof c === "string") ||
                !Array.isArray(d.rows)
            ) {
                return;
            }
            setPayload({...d, title: typeof d.title === "string" && d.title ? d.title : "variable"});
        };
        window.addEventListener("PRAXIS_OPEN_VARIABLE_GRID", onGrid);
        return () => window.removeEventListener("PRAXIS_OPEN_VARIABLE_GRID", onGrid);
    }, []);

    return (
        <VariableGridDialog
            open={payload !== null}
            onOpenChange={(o) => {
                if (!o) setPayload(null);
            }}
            data={payload}
        />
    );
}
