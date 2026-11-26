"use client";

import * as React from "react";
import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    ArrowUpDown,
    Columns2,
    Filter,
    Loader2,
    Plus,
    RotateCw,
    Save,
    Trash2,
    TriangleAlert,
    Undo2
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {parseCsv, separatorForExt, stringifyCsv} from "@/lib/csv-io";
// the configured interpreter — binary-sheet writes must target the
// same env the reader uses (env-consistency fix).
import {configuredInterpreter} from "@/lib/settings";
// Section 6— the spreadsheet formula layer: cells that start
// with `=` are evaluated with the tested safe evaluator in
// src/lib/csv-formula.ts (no eval, no dynamic code).
import {colIndexToLetters, evaluateGrid} from "@/lib/csv-formula";

/**
 * the editable CSV/TSV/XLSX grid — type directly into
 * cells, add/remove rows and columns, rename headers, undo; save
 * writes CSV/TSV as text (through the caller) and xlsx/parquet/feather
 * through /api/data-sheet-write (pandas). A pre-save local-history
 * snapshot is taken for binary formats here, so restores work.
 *
 * Section 6 additions:
 * ▸ FILTER — a per-column text filter row (toggleable from the
 * toolbar; case-insensitive substring on that column).
 * ▸ SORT — click a header to cycle asc → desc → none; stable
 * (original row order breaks ties) and numeric-aware compare.
 * ▸ FORMULAS — a minimal formula bar above the grid; cells starting
 * with `=` evaluate with the safe evaluator (arithmetic, cell
 * refs A1, ranges SUM/AVG/MIN/MAX/COUNT, ABS/ROUND/SQRT). The RAW
 * text stays the model — saves keep formulas as text so the file
 * round-trips — and the grid shows the evaluated value (or the
 * error string) while a cell is not focused.
 * ▸ ARIA GRID ROLES — role=grid/row/gridcell with aria-colindex +
 * aria-rowindex on every cell (the header is row 1, the optional
 * filter row is row 2, data rows follow).
 */

interface CsvGridEditorProps {
    /** Text form (CSV/TSV) — when present, saving goes through onSaveText. */
    text?: string;
    /** Typed form (xlsx/parquet/feather) — saving goes through the API.
     *  totalRows/totalCols/sheets carry the FULL workbook shape so the
     *  editor can refuse a save that would truncate data. */
    sheet?: {
        columns: string[];
        rows: unknown[][];
        totalRows?: number;
        totalCols?: number;
        sheets?: string[];
        sheet?: string;
    };
    fileName: string;
    folderSlug: string;
    fileSlug: string;
    /** Text-mode save (the FileViewer's existing save path). */
    onSaveText?: (next: string) => void;
    /** Called after a successful save so the parent can refresh. */
    onSaved?: () => void;
    fontScale?: number;
}

interface GridState {
    headers: string[];
    rows: string[][];
}

export function CsvGridEditor({
                                  text,
                                  sheet,
                                  fileName,
                                  folderSlug,
                                  fileSlug,
                                  onSaveText,
                                  onSaved,
                                  fontScale = 1
                              }: CsvGridEditorProps) {
    const {toast} = useToast();
    const isTextMode = text !== undefined && !!onSaveText;
    const ext = (fileName.split(".").pop() ?? "").toLowerCase();

    const initial = React.useMemo<GridState>(() => {
        if (text !== undefined) return parseCsv(text, separatorForExt(`.${ext}`));
        if (sheet) return {
            headers: sheet.columns.map(String),
            rows: sheet.rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))))
        };
        return {headers: [], rows: []};
    }, [text, sheet, ext]);
    // The ORIGINAL typed values of a binary sheet, kept so a save can
    // write back exactly what was read (a "007" cell stays "007" — the
    // old blanket toMaybeNumber coercion turned it into 7 and corrupted
    // zero-padded IDs, booleans and datetimes).
    const initialRaw = React.useMemo<unknown[][]>(() => (sheet ? sheet.rows : []), [sheet]);
    // TRUNCATION GUARD: the sheet preview caps at 1000 rows × 200 cols
    // server-side, and a multi-sheet workbook previews ONE sheet. Any
    // of those means a save would REPLACE the whole workbook with the
    // truncated grid — silent data loss. Editing stays available for
    // inspection, but Save is disabled with an explanation.
    const truncatedRows =
        !isTextMode && sheet ? Math.max(0, (sheet.totalRows ?? sheet.rows.length) - sheet.rows.length) : 0;
    const truncatedCols =
        !isTextMode && sheet ? Math.max(0, (sheet.totalCols ?? sheet.columns.length) - sheet.columns.length) : 0;
    const otherSheets =
        !isTextMode && sheet?.sheets ? Math.max(0, sheet.sheets.length - 1) : 0;
    const saveBlocked = truncatedRows > 0 || truncatedCols > 0 || otherSheets > 0;

    const [grid, setGrid] = React.useState<GridState>(initial);
    const [dirty, setDirty] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const undoStack = React.useRef<GridState[]>([]);
    // ── Section 6state: filter row + sort + selected cell ──
    /** Per-column filter text (index-aligned with headers; "" = off). */
    const [filters, setFilters] = React.useState<string[]>([]);
    /** True while the filter row is visible (the toolbar Filter toggle). */
    const [filterRow, setFilterRow] = React.useState(false);
    /** Sort spec: column index + direction (null = table order). */
    const [sort, setSort] = React.useState<{ col: number; dir: "asc" | "desc" } | null>(null);
    /** The selected cell (data-row index, column index) — feeds the
     *  formula bar + aria-selected. */
    const [selected, setSelected] = React.useState<{ r: number; c: number } | null>(null);

    React.useEffect(() => {
        setGrid(initial);
        setDirty(false);
        undoStack.current = [];
        // a fresh file resets the view state too (filter/sort/selection
        // pointed at the old file's columns).
        setFilters([]);
        setFilterRow(false);
        setSort(null);
        setSelected(null);
    }, [initial]);

    const snapshot = (next: GridState) => {
        undoStack.current.push(grid);
        if (undoStack.current.length > 50) undoStack.current.shift();
        setGrid(next);
        setDirty(true);
    };

    const undo = () => {
        const prev = undoStack.current.pop();
        if (prev) {
            setGrid(prev);
            setDirty(true);
        }
    };

    const setCell = (r: number, c: number, value: string) => {
        snapshot({
            headers: grid.headers,
            rows: grid.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row))
        });
    };

    const setHeader = (c: number, value: string) => {
        snapshot({headers: grid.headers.map((h, i) => (i === c ? value : h)), rows: grid.rows});
    };

    const addRow = () => {
        snapshot({headers: grid.headers, rows: [...grid.rows, new Array(grid.headers.length).fill("")]});
    };

    const removeRow = (r: number) => {
        snapshot({headers: grid.headers, rows: grid.rows.filter((_, ri) => ri !== r)});
    };

    const addColumn = () => {
        const name = `col${grid.headers.length + 1}`;
        snapshot({
            headers: [...grid.headers, name],
            rows: grid.rows.map((row) => [...row, ""]),
        });
    };

    const removeColumn = (c: number) => {
        if (grid.headers.length <= 1) return;
        snapshot({
            headers: grid.headers.filter((_, i) => i !== c),
            rows: grid.rows.map((row) => row.filter((_, i) => i !== c)),
        });
    };

    const moveColumn = (c: number, dir: -1 | 1) => {
        const target = c + dir;
        if (target < 0 || target >= grid.headers.length) return;
        const swap = <T, >(arr: T[]): T[] => arr.map((v, i) => (i === c ? arr[target] : i === target ? arr[c] : v));
        snapshot({headers: swap(grid.headers), rows: grid.rows.map((row) => swap(row))});
        setFilters((prev) => swap(prev));
        setSort(null); // the sorted column moved — reset to table order
        setSelected(null);
    };

    /* ── Filter + sort ──────────────────────────────────────
     * The view is derived (never mutates the model): rows keep their
     * ORIGINAL index so sort is stable and edits via setCell(r, …)
     * address the same row regardless of the current view. */
    const setFilterFor = (c: number, value: string) => {
        setFilters((prev) => {
            const next = [...prev];
            while (next.length < grid.headers.length) next.push("");
            next[c] = value;
            return next;
        });
    };

    const visibleRows = React.useMemo(() => {
        // Pair every row with its source index, then filter + sort.
        let rows = grid.rows.map((row, srcIdx) => ({row, srcIdx}));
        const active = filters.slice(0, grid.headers.length);
        const hasFilter = active.some((f) => f.trim() !== "");
        if (hasFilter) {
            rows = rows.filter(({row}) =>
                active.every((f, c) => {
                    const needle = f.trim().toLowerCase();
                    if (!needle) return true;
                    return (row[c] ?? "").toLowerCase().includes(needle);
                })
            );
        }
        if (sort) {
            const {col, dir} = sort;
            const mul = dir === "asc" ? 1 : -1;
            rows = [...rows].sort((a, b) => {
                const cmp = compareCells(a.row[col] ?? "", b.row[col] ?? "") * mul;
                return cmp !== 0 ? cmp : a.srcIdx - b.srcIdx; // STABLE tiebreak
            });
        }
        return rows;
    }, [grid.rows, grid.headers.length, filters, sort]);

    /* ── Formulas — the display matrix. Raw text stays the
     * model (saves keep formulas as text); evaluated values render in
     * every UNfocused cell, exactly like a spreadsheet. */
    const evaluated = React.useMemo(
        () => evaluateGrid({headers: grid.headers, rows: grid.rows}),
        [grid]
    );

    /* Arrow-key cell navigation (roving tabindex): the grid has full
     * ARIA roles but was Tab-order only. Arrow keys now move focus
     * cell-to-cell (clamped at the edges — no wrapping): Up/Down always
     * move; Left/Home move only when the caret sits at the START of the
     * cell's text and Right/End only at the END, so normal in-cell
     * caret editing keeps working. PageUp/PageDown jump 10 rows.
     * Exactly ONE data cell is a tab stop (see tabIndex below), so Tab
     * enters/leaves the grid once and the arrows roam inside it. */
    const handleGridKeyDown = (e: React.KeyboardEvent<HTMLTableElement>) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const el = e.target as HTMLElement;
        if (el.tagName !== "INPUT") return;
        const rAttr = el.getAttribute("data-grid-r");
        const cAttr = el.getAttribute("data-grid-c");
        if (rAttr === null || cAttr === null) return; // header / filter inputs
        const input = el as HTMLInputElement;
        const r = parseInt(rAttr, 10);
        const c = parseInt(cAttr, 10);
        const len = input.value.length;
        const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
        const atEnd = input.selectionStart === len && input.selectionEnd === len;
        const lastRow = Math.min(visibleRows.length, 2000) - 1;
        const lastCol = grid.headers.length - 1;
        let nr = r;
        let nc = c;
        switch (e.key) {
            case "ArrowUp":
                if (r <= 0) return;
                nr = r - 1;
                break;
            case "ArrowDown":
                if (r >= lastRow) return;
                nr = r + 1;
                break;
            case "PageUp":
                if (r <= 0) return;
                nr = Math.max(0, r - 10);
                break;
            case "PageDown":
                if (r >= lastRow) return;
                nr = Math.min(lastRow, r + 10);
                break;
            case "ArrowLeft":
                if (!atStart || c <= 0) return;
                nc = c - 1;
                break;
            case "ArrowRight":
                if (!atEnd || c >= lastCol) return;
                nc = c + 1;
                break;
            case "Home":
                if (!atStart || c <= 0) return;
                nc = 0;
                break;
            case "End":
                if (!atEnd || c >= lastCol) return;
                nc = lastCol;
                break;
            default:
                return;
        }
        e.preventDefault();
        const next = e.currentTarget.querySelector<HTMLInputElement>(
            `input[data-grid-r="${nr}"][data-grid-c="${nc}"]`
        );
        if (next) {
            next.focus();
            next.scrollIntoView({block: "nearest", inline: "nearest"});
        }
    };

    /* Roving tabindex: the SELECTED cell is the tab stop; when nothing
     * is selected (or the selection is outside the current view — the
     * row filtered out, the column removed) the first visible cell is,
     * so the grid is always reachable by Tab. */
    const visibleSrcIdx = React.useMemo(() => new Set(visibleRows.map((v) => v.srcIdx)), [visibleRows]);
    const selectionLive =
        selected !== null && visibleSrcIdx.has(selected.r) && selected.c < grid.headers.length;

    const save = async () => {
        setSaving(true);
        try {
            if (isTextMode) {
                const sep = separatorForExt(`.${ext}`);
                onSaveText?.(stringifyCsv(grid, sep));
                toast({title: `${fileName} saved`, variant: "success"});
            } else {
                // Binary formats: pre-save snapshot for Local History, then write.
                await fetch("/api/local-history/save", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: folderSlug,
                        file: fileSlug,
                        content: `<sheet before grid edit — ${new Date().toISOString()}>`,
                        label: "Before grid edit"
                    }),
                }).catch(() => undefined);
                const res = await fetch("/api/data-sheet-write", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: folderSlug,
                        file: fileSlug,
                        columns: grid.headers,
                        // Type-preserving cells: an UNTOUCHED cell writes back its
                        // ORIGINAL typed value (string "007" stays "007", dates
                        // stay ISO datetimes, booleans stay booleans); only edited
                        // or new cells go through the numeric coercion.
                        rows: grid.rows.map((row, ri) =>
                            row.map((cell, ci) => {
                                const trimmed = cell.trim();
                                if (trimmed === "") return null;
                                const raw = initialRaw[ri]?.[ci];
                                if (raw !== null && raw !== undefined && String(raw) === trimmed) return raw;
                                return toMaybeNumber(trimmed);
                            })
                        ),
                        // write with the SAME interpreter the preview read with
                        interpreter: configuredInterpreter(),
                    }),
                });
                const json = await res.json();
                if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
                toast({
                    title: `${fileName} saved`,
                    description: `${json.rows} rows written via ${json.engine}.`,
                    variant: "success"
                });
            }
            setDirty(false);
            onSaved?.();
        } catch (err) {
            toast({title: "Save failed", description: (err as Error).message, variant: "destructive"});
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b bg-muted/20">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={addRow}
                        title="Append an empty row">
                    <Plus className="size-3.5"/> Row
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={addColumn}
                        title="Append an empty column">
                    <Columns2 className="size-3.5"/> Column
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={undo}
                        disabled={undoStack.current.length === 0} title="Undo the last grid edit">
                    <Undo2 className="size-3.5"/> Undo
                </Button>
                {/* ── Filter toggle shows/hides the per-column
            filter row directly under the headers. */}
                <Button
                    variant={filterRow ? "default" : "ghost"}
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setFilterRow((v) => !v)}
                    aria-pressed={filterRow}
                    title="Show or hide the per-column text filter row (case-insensitive substring)"
                >
                    <Filter className="size-3.5"/> Filter
                </Button>
                {/* ── Sort reset back to the file's own row order. */}
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setSort(null)}
                    disabled={!sort && filters.every((f) => !f.trim())}
                    title="Clear the column sort (back to the file's row order)"
                >
                    <RotateCw className="size-3.5"/> Unsort
                </Button>
                <div className="flex-1"/>
                <span className="text-[10px] text-muted-foreground mr-1">
          {visibleRows.length.toLocaleString()}/{grid.rows.length.toLocaleString()} rows × {grid.headers.length}{" "}
                    {sort ? `· sorted by “${grid.headers[sort.col] ?? "?"}” ${sort.dir}` : ""} {dirty ? "· unsaved" : ""}
        </span>
                <Button
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    disabled={!dirty || saving || saveBlocked}
                    onClick={() => void save()}
                    title={
                        saveBlocked
                            ? "Saving is disabled: this sheet is larger than the editable preview (or the workbook has more sheets) — a save would replace the whole file with the truncated grid. Download the file or edit it in Excel / pandas."
                            : `Save the grid back to ${fileName}`
                    }
                >
                    {saving ? <Loader2 className="size-3.5 animate-spin"/> : <Save className="size-3.5"/>}
                    Save {isTextMode ? "text" : ext.toUpperCase()}
                </Button>
            </div>

            {/* ── Truncation guard banner — the binary-sheet preview caps at
          1000 rows × 200 cols and shows ONE sheet of the workbook;
          saving from here would silently DROP everything outside the
          preview. The banner says so, and Save above stays disabled. */}
            {saveBlocked && (
                <div
                    className="flex items-start gap-2 px-3 py-2 border-b bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="size-3.5 shrink-0 mt-0.5"/>
                    <p className="text-[11px] leading-relaxed">
                        <span className="font-semibold">Read-only preview — save disabled.</span> This{" "}
                        {ext.toUpperCase()} is larger than the editable window
                        {truncatedRows > 0 ? ` (${truncatedRows.toLocaleString()} more row${truncatedRows === 1 ? "" : "s"} not shown)` : ""}
                        {truncatedCols > 0 ? ` (${truncatedCols} more column${truncatedCols === 1 ? "" : "s"} not shown)` : ""}
                        {otherSheets > 0 ? ` (${otherSheets} other sheet${otherSheets === 1 ? "" : "s"} in the workbook)` : ""}
                        . Saving the visible grid would replace the entire file and
                        silently delete the rest — use Download or edit the file in
                        Excel/pandas instead.
                    </p>
                </div>
            )}

            {/* ── Formula bar — the selected cell's reference, raw
          text (editable → setCell), and the live evaluated preview.
          Cells starting with `=` are formulas (see lib/csv-formula). */}
            {selected && grid.rows[selected.r] !== undefined && (
                <div className="flex items-center gap-1.5 px-3 py-1 border-b bg-muted/10">
          <span
              className="shrink-0 px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono tabular-nums"
              title={`Column ${selected.c + 1} (${grid.headers[selected.c] ?? ""}), data row ${selected.r + 1}`}
          >
            {colIndexToLetters(selected.c)}{selected.r + 1}
          </span>
                    <input
                        value={grid.rows[selected.r][selected.c] ?? ""}
                        onChange={(e) => setCell(selected.r, selected.c, e.target.value)}
                        className="flex-1 min-w-0 bg-transparent px-1.5 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 ring-ring rounded"
                        aria-label="Formula bar — the selected cell's content"
                        placeholder="Value, or a formula like =SUM(A1:A5) / =B1*2"
                    />
                    <span
                        className={cn(
                            "shrink-0 max-w-40 truncate text-[10px] font-mono",
                            evaluated[selected.r]?.[selected.c]?.startsWith("#") ? "text-red-500" : "text-muted-foreground"
                        )}
                        title="The evaluated result of the selected cell"
                    >
            {evaluated[selected.r]?.[selected.c] && evaluated[selected.r][selected.c] !== (grid.rows[selected.r][selected.c] ?? "")
                ? `= ${evaluated[selected.r][selected.c]}`
                : ""}
          </span>
                </div>
            )}

            {/* Grid — ARIA grid roles the table is role="grid",
          rows role="row", header cells role="columnheader", body cells
          role="gridcell", every cell carrying aria-colindex and every
          row aria-rowindex (1 = header, 2 = the optional filter row,
          data rows follow). aria-rowcount covers the FULL table, not
          just the rendered 2,000-row window. */}
            <div className="flex-1 min-h-0 overflow-auto" data-testid="csv-grid-editor">
                <table
                    className="w-full text-xs border-separate border-spacing-0"
                    style={{fontSize: "12px", zoom: fontScale === 1 ? undefined : fontScale}}
                    role="grid"
                    aria-label={`${fileName} editable data grid`}
                    aria-rowcount={1 + (filterRow ? 1 : 0) + grid.rows.length}
                    onKeyDown={handleGridKeyDown}
                >
                    <thead className="sticky top-0 z-10">
                    <tr role="row" aria-rowindex={1}>
                        <th role="columnheader" aria-colindex={1}
                            className="bg-muted px-1 py-1 border-b border-r text-[9px] text-muted-foreground font-normal w-8 select-none">#
                        </th>
                        {grid.headers.map((h, c) => (
                            <th
                                key={c}
                                role="columnheader"
                                aria-colindex={c + 2}
                                aria-sort={sort?.col === c ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                                className="bg-muted/80 px-1 py-0.5 border-b border-r min-w-28"
                            >
                                <div className="flex items-center gap-0.5">
                                    <input
                                        value={h}
                                        onChange={(e) => setHeader(c, e.target.value)}
                                        className="flex-1 bg-transparent font-medium focus:outline-none focus:ring-1 ring-ring rounded px-1 min-w-0"
                                        aria-label={`Header of column ${c + 1}`}
                                    />
                                    {/* ── Sort button click cycles
                        none → asc → desc → none. */}
                                    <button
                                        type="button"
                                        className={cn("shrink-0", sort?.col === c ? "text-foreground" : "opacity-40 hover:opacity-100 text-muted-foreground")}
                                        onClick={() =>
                                            setSort((prev) =>
                                                prev?.col === c
                                                    ? prev.dir === "asc"
                                                        ? {col: c, dir: "desc"}
                                                        : null // second click on the same column clears
                                                    : {col: c, dir: "asc"}
                                            )
                                        }
                                        title={`Sort by “${h || `column ${c + 1}`}” (click: ascending → descending → off)`}
                                        aria-label={`Sort by column ${c + 1}`}
                                    >
                                        {sort?.col === c ? (
                                            sort.dir === "asc" ? <ArrowUp className="size-2.5"/> :
                                                <ArrowDown className="size-2.5"/>
                                        ) : (
                                            <ArrowUpDown className="size-2.5"/>
                                        )}
                                    </button>
                                    <button type="button" className="opacity-40 hover:opacity-100 shrink-0"
                                            onClick={() => moveColumn(c, -1)} title="Move column left">
                                        <ArrowLeft className="size-2.5"/>
                                    </button>
                                    <button type="button" className="opacity-40 hover:opacity-100 shrink-0"
                                            onClick={() => moveColumn(c, 1)} title="Move column right">
                                        <ArrowRight className="size-2.5"/>
                                    </button>
                                    <button type="button" className="opacity-40 hover:opacity-100 text-red-500 shrink-0"
                                            onClick={() => removeColumn(c)} title="Delete column">
                                        <Trash2 className="size-2.5"/>
                                    </button>
                                </div>
                            </th>
                        ))}
                    </tr>
                    {/* ── The filter row — one text input per column;
                visible only while the toolbar Filter toggle is on. */}
                    {filterRow && (
                        <tr role="row" aria-rowindex={2} className="bg-muted/40">
                            <td role="gridcell" aria-colindex={1}
                                className="px-1 py-0 border-b border-r text-[9px] text-center text-muted-foreground select-none"
                                title="Filter row — type to narrow the rows below">
                                <Filter className="size-2.5 mx-auto opacity-60" aria-hidden/>
                            </td>
                            {grid.headers.map((h, c) => (
                                <td key={c} role="gridcell" aria-colindex={c + 2}
                                    className="px-1 py-0 border-b border-r p-0">
                                    <input
                                        value={filters[c] ?? ""}
                                        onChange={(e) => setFilterFor(c, e.target.value)}
                                        className="w-full bg-transparent px-1.5 py-0.5 font-mono text-[10px] italic focus:outline-none focus:ring-1 ring-ring rounded-none text-muted-foreground"
                                        placeholder="filter…"
                                        aria-label={`Filter column ${c + 1} (${h})`}
                                    />
                                </td>
                            ))}
                        </tr>
                    )}
                    </thead>
                    <tbody>
                    {visibleRows.slice(0, 2000).map(({row, srcIdx}, viewIdx) => (
                        <tr
                            key={srcIdx}
                            role="row"
                            aria-rowindex={(filterRow ? 3 : 2) + viewIdx}
                            className={cn(srcIdx % 2 === 1 && "bg-muted/20")}
                        >
                            <td role="gridcell" aria-colindex={1}
                                className="px-1 py-0.5 border-b border-r text-[9px] text-muted-foreground text-center select-none align-middle">
                                <span className="block">{srcIdx + 1}</span>
                                <button type="button"
                                        className="opacity-0 group-hover:opacity-100 hover:opacity-100 text-red-500"
                                        style={{opacity: 0.35}} onClick={() => removeRow(srcIdx)} title="Delete row">
                                    <ArrowDown className="size-2.5 rotate-180"/>
                                </button>
                            </td>
                            {row.map((cell, c) => (
                                <td
                                    key={c}
                                    role="gridcell"
                                    aria-colindex={c + 2}
                                    aria-selected={selected?.r === srcIdx && selected?.c === c}
                                    className="border-b border-r p-0"
                                >
                                    <GridCellInput
                                        raw={cell}
                                        display={evaluated[srcIdx]?.[c] ?? cell}
                                        onChange={(value) => setCell(srcIdx, c, value)}
                                        onSelect={() => setSelected({r: srcIdx, c})}
                                        isFormula={cell.startsWith("=")}
                                        label={`Cell row ${srcIdx + 1} column ${c + 1}`}
                                        gridR={viewIdx}
                                        gridC={c}
                                        tabIndex={
                                            (selectionLive && selected
                                                ? selected.r === srcIdx && selected.c === c
                                                : viewIdx === 0 && c === 0)
                                                ? 0
                                                : -1
                                        }
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                    </tbody>
                </table>
                {grid.rows.length > 2000 && (
                    <p className="px-3 py-2 text-[10px] text-muted-foreground italic">
                        Showing the first 2,000 rows — the full {grid.rows.length.toLocaleString()} save from memory.
                    </p>
                )}
                {visibleRows.length === 0 && grid.rows.length > 0 && (
                    <p className="px-3 py-2 text-[10px] text-muted-foreground italic">
                        No rows match the current filter.
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * GridCellInput — one grid cell's <input>. While FOCUSED it shows the
 * RAW text (formulas edit as text, like a spreadsheet); unfocused it
 * shows the evaluated display value (formula result or error string).
 */
function GridCellInput({
                           raw,
                           display,
                           onChange,
                           onSelect,
                           isFormula,
                           label,
                           gridR,
                           gridC,
                           tabIndex,
                       }: {
    raw: string;
    display: string;
    onChange: (value: string) => void;
    onSelect: () => void;
    isFormula: boolean;
    label: string;
    /** View row / column coordinates for the arrow-key navigation
     *  (data-grid-r / data-grid-c on the input; see handleGridKeyDown). */
    gridR: number;
    gridC: number;
    /** Roving tabindex: 0 on the single tab-stop cell, -1 otherwise. */
    tabIndex: number;
}) {
    const [focused, setFocused] = React.useState(false);
    return (
        <input
            value={focused ? raw : display}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
                setFocused(true);
                onSelect();
            }}
            onBlur={() => setFocused(false)}
            tabIndex={tabIndex}
            data-grid-r={gridR}
            data-grid-c={gridC}
            className={cn(
                "w-full bg-transparent px-1.5 py-0.5 font-mono focus:outline-none focus:ring-1 ring-ring rounded-none",
                isNumericText(display) && !isFormula && "text-right tabular-nums text-amber-700 dark:text-amber-300",
                display.startsWith("#") && !isFormula && "text-red-500",
                isFormula && !focused && "text-violet-700 dark:text-violet-300",
                !isFormula && raw.trim() === "" && display.trim() === "" && "text-muted-foreground italic"
            )}
            aria-label={label}
            title={isFormula && !focused ? `${raw}\n= ${display}` : undefined}
        />
    );
}

/** Numeric-aware cell compare for the column sort
 *  two numeric texts compare numerically, anything else
 *  case-insensitively by locale; numbers sort before text. */
function compareCells(a: string, b: string): number {
    const na = toNumber(a);
    const nb = toNumber(b);
    if (na !== null && nb !== null) return na === nb ? 0 : na < nb ? -1 : 1;
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return a.trim().toLowerCase().localeCompare(b.trim().toLowerCase());
}

function toNumber(cell: string): number | null {
    const t = cell.trim().replace(/,/g, "");
    if (!t || !/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

function isNumericText(cell: string): boolean {
    const t = cell.trim();
    return t !== "" && /^[-+]?[\d.,]+([eE][-+]?\d+)?$/.test(t) && Number.isFinite(Number(t.replace(/,/g, "")));
}

function toMaybeNumber(cell: string): string | number | boolean | null {
    const t = cell.trim();
    if (t === "") return null;
    if (t === "true" || t === "True") return true;
    if (t === "false" || t === "False") return false;
    if (isNumericText(t)) return Number(t.replace(/,/g, ""));
    return cell;
}
