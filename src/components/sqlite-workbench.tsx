"use client";

import * as React from "react";
import {
    Database,
    Download,
    Eye,
    GripHorizontal,
    KeyRound,
    Link2,
    Loader2,
    Maximize2,
    Network,
    Palette,
    Play,
    RotateCcw,
    Save,
    Search,
    Table2,
    Trash2,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import {Dialog, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {ResizableDialogContent} from "@/components/ui/resizable-dialog";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Skeleton} from "@/components/ui/skeleton";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {configuredInterpreter, interpreterQuery} from "@/lib/settings";
import {
    djangoModelsFromSchema,
    prismaSchemaFromSchema,
    relationsReportFromSchema,
    sqlalchemyModelsFromSchema,
} from "@/lib/sql-orm";

/**
 * the SQLite SQL workbench — schema tree + query editor
 * + results grid + saved queries (localStorage), over the read-only
 * /api/sqlite-query route. Opened from the file context menu on .db
 * files and the Data menu.
 *
 * a GRAPHICAL SCHEMA view (ER diagram) was added — tables
 * render as nodes with typed columns (primary keys keyed, foreign-key
 * links drawn as curves), zoomable and exportable as SVG. The two
 * views (SQL / Diagram) are tabs in the workbench body.
 */

export interface ColumnInfo {
    name: string;
    type: string;
    pk?: boolean;
}

export interface ForeignKey {
    from: string;
    table: string;
    to: string;
}

export interface TableInfo {
    name: string;
    type: string;
    columns: ColumnInfo[];
    rows: number | null;
    fks?: ForeignKey[];
}

/** One index of the schema (Section 6,— from
 *  PRAGMA index_list(<table>) + index_info(<name>). */
export interface IndexInfo {
    name: string;
    table: string;
    unique?: boolean;
    /** c = CREATE INDEX, u = UNIQUE constraint, pk = PRIMARY KEY. */
    origin?: string;
    partial?: boolean;
    columns?: string[];
}

interface QueryResult {
    columns: string[];
    rows: unknown[][];
    truncated?: boolean;
    changes?: number;
}

interface SqliteWorkbenchProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
}

const HISTORY_KEY = "praxis.sql-queries";
/** localStorage key for the write-mode toggle — default OFF). */
const WRITE_KEY = "praxis.sql-write";

function loadHistory(): string[] {
    try {
        const raw = window.localStorage.getItem(HISTORY_KEY);
        return raw ? (JSON.parse(raw) as string[]).slice(0, 30) : [];
    } catch {
        return [];
    }
}

function saveHistory(queries: string[]): void {
    try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(queries.slice(0, 30)));
    } catch {
        /* quota — ignore */
    }
}

// ─── ER diagram layout ─────────────────────────────────────────────

/** Base text size of the diagram — the SAME 13px the .sql source
 *  view and every CodeViewSurface render at, so the .db diagram bars
 *  read at the unified code-view size (before the diagram's own zoom
 *  or the viewer's zoom multiplier). */
const DIAGRAM_FONT_PX = 13;
/** Geometry derived from the base font: row height, header height,
 *  paddings and gaps all scale with it. */
const ROW_H = Math.round(DIAGRAM_FONT_PX * 1.85); // 24
const HEAD_H = Math.round(DIAGRAM_FONT_PX * 2.3); // 30
const PAD_X = 10;
const COL_W_GAP = 56;
const ROW_W_GAP = 48;

interface NodeBox {
    table: TableInfo;
    x: number;
    y: number;
    w: number;
    h: number;
    colY: (colName: string) => number | null;
}

/** Deterministic grid layout for the ER diagram. */
function layoutTables(tables: TableInfo[]): { nodes: NodeBox[]; width: number; height: number } {
    const usable = tables.filter((t) => t.type === "table" || t.type === "view");
    const perRow = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(usable.length))));
    // Char width ≈ 0.62em at the diagram font — the box fits the
    // longest name + type pair with the same headroom at any size.
    const charW = DIAGRAM_FONT_PX * 0.62;
    const measure = (t: TableInfo) => {
        const longest =
            Math.max(t.name.length, ...t.columns.map((c) => c.name.length + c.type.length + 4)) + 4;
        return Math.max(190, Math.min(360, Math.round(longest * charW)));
    };
    const nodes: NodeBox[] = [];
    let rowMaxH = 0;
    let x = 16;
    let y = 16;
    let maxX = 16;
    usable.forEach((t, i) => {
        const w = measure(t);
        const h = HEAD_H + t.columns.length * ROW_H + 6;
        // Snapshot THIS node's coordinates — the colY closure must not
        // capture the mutable loop `y` (it keeps growing after row wraps,
        // which used to push FK edge endpoints outside the viewBox and
        // clip every relation line).
        const nodeX = x;
        const nodeY = y;
        const node: NodeBox = {
            table: t,
            x: nodeX,
            y: nodeY,
            w,
            h,
            colY: (colName: string) => {
                const idx = t.columns.findIndex((c) => c.name === colName);
                return idx === -1 ? null : nodeY + HEAD_H + idx * ROW_H + ROW_H / 2;
            },
        };
        nodes.push(node);
        rowMaxH = Math.max(rowMaxH, h);
        maxX = Math.max(maxX, x + w);
        x += w + COL_W_GAP;
        if ((i + 1) % perRow === 0) {
            x = 16;
            y += rowMaxH + ROW_W_GAP;
            rowMaxH = 0;
        }
    });
    // Canvas covers the TALLEST node (the last node's bottom used to
    // define the height, clipping taller table boxes in mixed rows).
    const maxY = nodes.reduce((m, n) => Math.max(m, n.y + n.h), 16);
    return {
        nodes,
        width: maxX + 16,
        height: maxY + 16,
    };
}

/** The schema diagram itself — pure SVG, no external deps.
 *  Exported for the .sql file viewer's schema diagram too
 *  (parseSqlSchema produces compatible TableInfo objects).
 *
 *  Features: zoom + Fit (measured against the SCROLL CONTAINER so
 *  repeated clicks never compound), draggable table nodes (drag any
 *  table to rearrange — Reset layout restores the grid), a table
 *  filter, column-type / row-count toggles, and full COLOR control:
 *  colorize every relation its own color, colorize every table its
 *  own color, unify everything back to the default scheme, or pick
 *  an exact color for any single line / table. */
const EDGE_PALETTE = [
    "#0ea5e9", "#f97316", "#8b5cf6", "#10b981", "#ef4444", "#eab308",
    "#ec4899", "#14b8a6", "#6366f1", "#f43f5e", "#84cc16", "#a855f7",
];
const TABLE_PALETTE = [
    "#10b981", "#0ea5e9", "#f97316", "#8b5cf6", "#ef4444", "#eab308",
    "#ec4899", "#14b8a6", "#6366f1", "#f43f5e", "#84cc16", "#a855f7",
];
const DEFAULT_EDGE_COLOR = "#0ea5e9";
const DEFAULT_TABLE_COLOR = "#10b981";

export function SchemaDiagram({
                                  tables,
                                  onPickTable,
                              }: {
    tables: TableInfo[];
    /** Optional — clicking a table node focuses it in the host UI
     * (the .sql viewer sets a focused chip; the .db viewer simply
     * re-uses the diagram standalone). */
    onPickTable?: (name: string) => void;
}) {
    const [zoom, setZoom] = React.useState(1);
    const [filterText, setFilterText] = React.useState("");
    const [showTypes, setShowTypes] = React.useState(true);
    const [showRows, setShowRows] = React.useState(true);
    const {nodes, width, height} = React.useMemo(() => layoutTables(tables), [tables]);
    const svgRef = React.useRef<SVGSVGElement | null>(null);

    // ── Drag: user-moved table positions override the grid layout.
    const [positions, setPositions] = React.useState<Record<string, { x: number; y: number }>>({});
    const dragRef = React.useRef<{
        name: string;
        startX: number;
        startY: number;
        origX: number;
        origY: number;
        moved: boolean;
    } | null>(null);
    const justDraggedRef = React.useRef(false);

    // ── Color control: per-line / per-table custom picks + the two
    //    one-click schemes (distinct / unified defaults).
    const [lineColorMode, setLineColorMode] = React.useState<"unified" | "distinct">("unified");
    const [tableColorMode, setTableColorMode] = React.useState<"unified" | "distinct">("unified");
    const [customLineColors, setCustomLineColors] = React.useState<Record<string, string>>({});
    const [customTableColors, setCustomTableColors] = React.useState<Record<string, string>>({});
    /** The INLINE color panel toggle (replaces the dropdown — see the
     *  toolbar comment; the panel lives under the toolbar, never in a
     *  menu, so the OS color picker cannot close it mid-pick). */
    const [colorsPanelOpen, setColorsPanelOpen] = React.useState(false);

    /** The grid layout with the dragged overrides applied (the
     * FK edges, the canvas bounds and the colY closures all follow the
     * FINAL positions so relations track a dragged table). */
    const positionedNodes = React.useMemo(() => {
        return nodes.map((n) => {
            const p = positions[n.table.name];
            if (!p) return n;
            return {
                ...n,
                x: p.x,
                y: p.y,
                colY: (colName: string) => {
                    const idx = n.table.columns.findIndex((c) => c.name === colName);
                    return idx === -1 ? null : p.y + HEAD_H + idx * ROW_H + ROW_H / 2;
                },
            };
        });
    }, [nodes, positions]);
    // The canvas always covers dragged nodes too (a table dragged to the
    // far right must never clip outside the viewBox).
    const canvasW = Math.max(width, ...positionedNodes.map((n) => n.x + n.w + 16));
    const canvasH = Math.max(height, ...positionedNodes.map((n) => n.y + n.h + 16));

    const fkEdges = React.useMemo(() => {
        const edges: Array<{
            id: string;
            path: string;
            label: string;
            selfLoop: boolean;
        }> = [];
        const byName = new Map(positionedNodes.map((n) => [n.table.name, n]));
        for (const node of positionedNodes) {
            for (const fk of node.table.fks ?? []) {
                const target = byName.get(fk.table);
                if (!target) continue;
                const sy = node.colY(fk.from) ?? node.y + HEAD_H / 2;
                const ty = target.colY(fk.to) ?? target.colY("id") ?? target.y + HEAD_H / 2;
                let path: string;
                if (target === node) {
                    // Self-reference: loop around the right side.
                    const rx = node.x + node.w;
                    path = `M ${rx - 2} ${sy} C ${rx + 46} ${sy}, ${rx + 46} ${ty}, ${rx - 2} ${ty}`;
                } else {
                    const sourceRight = node.x + node.w / 2 < target.x + target.w / 2;
                    const sx = sourceRight ? node.x + node.w : node.x;
                    const tx = sourceRight ? target.x : target.x + target.w;
                    const mid = (sx + tx) / 2;
                    path = `M ${sx} ${sy} C ${mid} ${sy}, ${mid} ${ty}, ${tx} ${ty}`;
                }
                edges.push({
                    id: `${node.table.name}.${fk.from}->${fk.table}.${fk.to}`,
                    path,
                    label: fk.from === fk.to ? fk.from : `${fk.from} → ${fk.to}`,
                    selfLoop: target === node,
                });
            }
        }
        return edges;
    }, [positionedNodes]);

    /** Fit measures the SCROLL CONTAINER (the visible viewport), never
     *  the scaled SVG itself — the old fit measured its own zoomed
     *  width, so every click shaved 8/width off the zoom and repeated
     *  clicks kept shrinking the diagram. Width always binds; height is
     *  only considered when the container has REAL extra room (in some
     *  layouts the container's height is driven by the scaled svg
     *  itself — fitting against it compounded the shrink). The clamp
     *  matches Zoom In (0.3–2.0). */
    const fit = () => {
        const svg = svgRef.current;
        if (!svg) return;
        const container = svg.parentElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const availW = Math.max(80, rect.width - 16);
        let scale = availW / canvasW;
        if (rect.height > canvasH * zoom + 8) {
            scale = Math.min(scale, (rect.height - 16) / canvasH);
        }
        scale = Math.min(2, Math.max(0.3, scale));
        setZoom(Math.round(scale * 100) / 100);
    };

    const exportSvg = () => {
        const svg = svgRef.current;
        if (!svg) return;
        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.setAttribute("width", String(canvasW));
        clone.setAttribute("height", String(canvasH));
        const xml = new XMLSerializer().serializeToString(clone);
        const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`], {
            type: "image/svg+xml",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "schema-diagram.svg";
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Drag handlers (pointer events with capture; a <4px move stays a
    //    click so picking a table still works).
    const pointerToSvg = (clientX: number, clientY: number) => {
        const svg = svgRef.current;
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        return {x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom};
    };
    const onNodePointerDown = (e: React.PointerEvent<SVGGElement>, n: NodeBox) => {
        if (e.button !== 0) return;
        const p = pointerToSvg(e.clientX, e.clientY);
        if (!p) return;
        dragRef.current = {name: n.table.name, startX: p.x, startY: p.y, origX: n.x, origY: n.y, moved: false};
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            /* capture is best-effort */
        }
    };
    const onNodePointerMove = (e: React.PointerEvent<SVGGElement>) => {
        const d = dragRef.current;
        if (!d) return;
        const p = pointerToSvg(e.clientX, e.clientY);
        if (!p) return;
        const dx = p.x - d.startX;
        const dy = p.y - d.startY;
        if (!d.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        d.moved = true;
        justDraggedRef.current = true;
        setPositions((prev) => ({
            ...prev,
            [d.name]: {x: Math.max(0, d.origX + dx), y: Math.max(0, d.origY + dy)},
        }));
    };
    const onNodePointerUp = (e: React.PointerEvent<SVGGElement>) => {
        if (!dragRef.current) return;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            /* release is best-effort */
        }
        dragRef.current = null;
        // Reset AFTER the click event that follows pointerup, so a drag
        // never double-triggers the table-pick action.
        window.setTimeout(() => {
            justDraggedRef.current = false;
        }, 0);
    };

    const effectiveEdgeColor = (edgeId: string, index: number) =>
        customLineColors[edgeId] ??
        (lineColorMode === "distinct" ? EDGE_PALETTE[index % EDGE_PALETTE.length] : DEFAULT_EDGE_COLOR);
    const effectiveTableColor = (name: string, index: number) =>
        customTableColors[name] ??
        (tableColorMode === "distinct" ? TABLE_PALETTE[index % TABLE_PALETTE.length] : DEFAULT_TABLE_COLOR);

    // The filter — a table matches when its name OR any column name
    // contains the text (case-insensitive). Non-matching tables dim to
    // 25% (layout stays stable — nothing re-flows).
    const needle = filterText.trim().toLowerCase();
    const tablesByName = React.useMemo(
        () => new Map(tables.map((t) => [t.name, t])),
        [tables]
    );
    const tableMatches = (t: TableInfo) => {
        if (!needle) return true;
        if (t.name.toLowerCase().includes(needle)) return true;
        return t.columns.some((c) => c.name.toLowerCase().includes(needle));
    };
    const matchCount = needle ? positionedNodes.filter((n) => tableMatches(n.table)).length : positionedNodes.length;

    if (nodes.length === 0) {
        return (
            <p className="text-xs text-muted-foreground p-4">
                No tables in this database — the diagram appears once tables exist.
            </p>
        );
    }

    const optionToggle = (
        activeState: boolean,
        onToggle: () => void,
        label: string,
        title: string,
    ) => (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={activeState}
            title={title}
            className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors",
                activeState
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
        >
            <Eye className="size-3"/>
            {label}
        </button>
    );

    return (
        <div className="flex flex-col min-h-0 flex-1">
            {/* the redesigned toolbar — a padded header bar with a
          hairline underneath. Nothing touches the upper border of the
          view any more (the old row had pb-2 only and the buttons +
          legend rode the very top edge). */}
            <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-2.5 py-2 shrink-0">
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
                        onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))} title="Zoom out">
                    <ZoomOut className="size-3"/>
                </Button>
                <span className="text-[11px] tabular-nums text-muted-foreground w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
                        onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))} title="Zoom in">
                    <ZoomIn className="size-3"/>
                </Button>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={fit}
                        title="Fit the whole diagram into the visible area (both axes)">
                    <Maximize2 className="size-3"/> Fit
                </Button>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={exportSvg}
                        title="Download the diagram as an .svg file">
                    <Download className="size-3"/> Export SVG
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setPositions({})}
                    disabled={Object.keys(positions).length === 0}
                    title="Restore the automatic grid layout (clears every dragged table position)"
                >
                    <RotateCcw className="size-3"/> Reset layout
                </Button>
                {/* ── Colors — an INLINE, collapsible color panel. The old
            design nested <input type="color"> inside Radix dropdown
            items: the OS color picker steals focus, Radix closes the
            menu on focus-outside, and the aborting native picker made
            BOTH "Table colors…" and "Relation colors…" feel dead.
            Native inputs in a plain panel never fight the menu — every
            pick applies live. */}
                <Button
                    variant={colorsPanelOpen ? "default" : "outline"}
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setColorsPanelOpen((v) => !v)}
                    aria-pressed={colorsPanelOpen}
                    title="Open the color panel — one-click schemes plus an exact color for any single table or relation line"
                >
                    <Palette className="size-3"/> Colors
                </Button>
                {/* Options: filter + column types + row counts */}
                <label className="ml-auto flex items-center gap-1.5"
                       title="Filter tables by name or column — non-matching tables dim">
                    <Search className="size-3 text-muted-foreground"/>
                    <input
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        placeholder="filter tables…"
                        aria-label="Filter tables in the diagram"
                        className="h-7 w-36 rounded-md border bg-background px-2 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                </label>
                {optionToggle(showTypes, () => setShowTypes((v) => !v), "Types", "Show or hide the column type column (INTEGER, TEXT, …) inside each table node")}
                {optionToggle(showRows, () => setShowRows((v) => !v), "Rows", "Show or hide the row-count label in each table header")}
            </div>
            {colorsPanelOpen && (
                <div className="border-b bg-muted/10 px-2.5 py-2 shrink-0" data-testid="schema-color-panel">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 text-[10px]"
                            onClick={() => {
                                setLineColorMode("distinct");
                                setCustomLineColors({});
                            }}
                            title="Every foreign-key relation gets its own color"
                        >
                            <Link2 className="size-3" style={{color: EDGE_PALETTE[1]}}/> Colorize Relations
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 text-[10px]"
                            onClick={() => {
                                setTableColorMode("distinct");
                                setCustomTableColors({});
                            }}
                            title="Every table header gets its own color"
                        >
                            <Table2 className="size-3" style={{color: TABLE_PALETTE[1]}}/> Colorize Tables
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 text-[10px]"
                            onClick={() => {
                                setLineColorMode("unified");
                                setTableColorMode("unified");
                                setCustomLineColors({});
                                setCustomTableColors({});
                            }}
                            title="Back to the default scheme — one color for all relations, one for all tables"
                        >
                            <Palette className="size-3 text-muted-foreground"/> Unify Colors
                        </Button>
                        <span className="text-[10px] text-muted-foreground">picks apply live · drag a swatch for the OS picker</span>
                    </div>
                    <div className="mt-1.5 grid gap-2 lg:grid-cols-2">
                        {/* Per-table custom colors */}
                        <div className="rounded-md border bg-background p-1.5">
                            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Table
                                Colors</p>
                            <div className="max-h-44 overflow-y-auto space-y-0.5 pr-1">
                                {positionedNodes.map((n) => (
                                    <label key={n.table.name}
                                           className="flex items-center gap-1.5 text-[11px] rounded px-1 py-0.5 hover:bg-muted/50">
                                        <input
                                            type="color"
                                            aria-label={`Color for table ${n.table.name}`}
                                            value={customTableColors[n.table.name] ?? effectiveTableColor(n.table.name, positionedNodes.indexOf(n))}
                                            onChange={(e) => setCustomTableColors((prev) => ({
                                                ...prev,
                                                [n.table.name]: e.target.value
                                            }))}
                                            className="h-5 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                                        />
                                        <span className="flex-1 truncate">{n.table.name}</span>
                                        {customTableColors[n.table.name] && (
                                            <button
                                                type="button"
                                                className="text-[10px] text-muted-foreground hover:text-foreground"
                                                onClick={() =>
                                                    setCustomTableColors((prev) => {
                                                        const next = {...prev};
                                                        delete next[n.table.name];
                                                        return next;
                                                    })
                                                }
                                                title="Back to the scheme color"
                                            >
                                                Reset
                                            </button>
                                        )}
                                    </label>
                                ))}
                            </div>
                        </div>
                        {/* Per-relation custom colors */}
                        <div className="rounded-md border bg-background p-1.5">
                            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Relation
                                Colors</p>
                            {fkEdges.length > 0 ? (
                                <div className="max-h-44 overflow-y-auto space-y-0.5 pr-1">
                                    {fkEdges.map((e, idx) => (
                                        <label key={e.id}
                                               className="flex items-center gap-1.5 text-[11px] rounded px-1 py-0.5 hover:bg-muted/50">
                                            <input
                                                type="color"
                                                aria-label={`Color for relation ${e.label}`}
                                                value={customLineColors[e.id] ?? effectiveEdgeColor(e.id, idx)}
                                                onChange={(ev) => setCustomLineColors((prev) => ({
                                                    ...prev,
                                                    [e.id]: ev.target.value
                                                }))}
                                                className="h-5 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                                            />
                                            <span className="flex-1 truncate" title={e.id}>{e.label}</span>
                                            {customLineColors[e.id] && (
                                                <button
                                                    type="button"
                                                    className="text-[10px] text-muted-foreground hover:text-foreground"
                                                    onClick={() =>
                                                        setCustomLineColors((prev) => {
                                                            const next = {...prev};
                                                            delete next[e.id];
                                                            return next;
                                                        })
                                                    }
                                                    title="Back to the scheme color"
                                                >
                                                    Reset
                                                </button>
                                            )}
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <p className="px-1 py-2 text-[10px] text-muted-foreground italic">No foreign-key
                                    relations in this schema.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* the legend row — its own padded line under the
          toolbar (it used to share the crowded first row). */}
            <div
                className="flex items-center gap-3 px-2.5 py-1.5 text-[11px] text-muted-foreground border-b bg-muted/10 shrink-0">
        <span className="flex items-center gap-1">
          <KeyRound className="size-3 text-amber-500"/> primary key
        </span>
                <span className="flex items-center gap-1">
          <Link2 className="size-3"
                 style={{color: lineColorMode === "distinct" || Object.keys(customLineColors).length > 0 ? EDGE_PALETTE[0] : DEFAULT_EDGE_COLOR}}/>
          foreign key{lineColorMode === "distinct" ? " (each relation its own color)" : ""}
        </span>
                <span className="flex items-center gap-1">
          <GripHorizontal className="size-3"/> drag a table to rearrange
        </span>
                {needle && (
                    <span className="ml-auto text-[10px]">
            {matchCount}/{positionedNodes.length} table{positionedNodes.length === 1 ? "" : "s"} match &ldquo;{filterText.trim()}&rdquo;
          </span>
                )}
            </div>
            <div className="m-2 mt-3 rounded-md border flex-1 min-h-[280px] overflow-auto bg-muted/20">
                <svg
                    ref={svgRef}
                    width={canvasW * zoom}
                    height={canvasH * zoom}
                    viewBox={`0 0 ${canvasW} ${canvasH}`}
                    className="block"
                    role="img"
                    aria-label="Database schema diagram"
                >
                    {/* FK edges UNDER the nodes — each edge carries its EFFECTIVE
              color (a custom pick, the distinct palette, or the unified
              default) as a plain attribute so the .svg export keeps it.
              Edges dim with their endpoints when the filter is active. */}
                    <g>
                        {fkEdges.map((e, idx) => {
                            const color = effectiveEdgeColor(e.id, idx);
                            const [left, right] = e.id.split("->");
                            const srcName = left.split(".")[0];
                            const tgtName = right.split(".")[0];
                            const srcTable = tablesByName.get(srcName);
                            const tgtTable = tablesByName.get(tgtName);
                            const endpointDimmed =
                                !!needle &&
                                (!srcTable || !tgtTable || !tableMatches(srcTable) || !tableMatches(tgtTable));
                            return (
                                <g key={e.id} style={{opacity: endpointDimmed ? 0.2 : 1}}>
                                    <path
                                        d={e.path}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={1.4}
                                    />
                                    <circle
                                        cx={e.path.split(" ")[1]}
                                        cy={e.path.split(" ")[2]}
                                        r={3}
                                        fill={color}
                                    />
                                </g>
                            );
                        })}
                    </g>
                    {/* Table nodes — DRAGGABLE: grab anywhere on a node and move
              it; the relation lines follow. The name click still loads
              the table's rows (a real drag never triggers the pick). */}
                    {positionedNodes.map((n) => {
                        const idx = positionedNodes.indexOf(n);
                        const color = effectiveTableColor(n.table.name, idx);
                        return (
                            <g
                                key={n.table.name}
                                transform={`translate(${n.x}, ${n.y})`}
                                style={{
                                    opacity: needle && !tableMatches(n.table) ? 0.25 : 1,
                                    cursor: "grab",
                                }}
                                onPointerDown={(e) => onNodePointerDown(e, n)}
                                onPointerMove={onNodePointerMove}
                                onPointerUp={onNodePointerUp}
                                onPointerCancel={onNodePointerUp}
                            >
                                <rect
                                    width={n.w}
                                    height={n.h}
                                    rx={6}
                                    className="fill-background stroke-border"
                                    strokeWidth={1.2}
                                />
                                <rect
                                    width={n.w}
                                    height={HEAD_H}
                                    rx={6}
                                    fill={color}
                                    fillOpacity={0.18}
                                />
                                <rect
                                    y={HEAD_H - 6}
                                    width={n.w}
                                    height={6}
                                    fill={color}
                                    fillOpacity={0.18}
                                />
                                <text
                                    x={PAD_X}
                                    y={HEAD_H - 10}
                                    className="fill-foreground font-semibold cursor-pointer"
                                    style={{fontSize: DIAGRAM_FONT_PX}}
                                    onClick={() => {
                                        if (justDraggedRef.current) return;
                                        onPickTable?.(n.table.name);
                                    }}
                                >
                                    {n.table.name}
                                </text>
                                {showRows && n.table.rows !== null && (
                                    <text
                                        x={n.w - PAD_X}
                                        y={HEAD_H - 10}
                                        textAnchor="end"
                                        className="fill-muted-foreground"
                                        style={{fontSize: Math.round(DIAGRAM_FONT_PX * 0.88)}}
                                    >
                                        {n.table.rows} rows
                                    </text>
                                )}
                                {n.table.columns.map((c, i) => {
                                    const y = HEAD_H + i * ROW_H;
                                    return (
                                        <g key={c.name}>
                                            <text x={PAD_X} y={y + Math.round(ROW_H * 0.68)} className="fill-foreground"
                                                  style={{fontSize: DIAGRAM_FONT_PX}}>
                                                {c.pk ? "🔑 " : ""}
                                                {c.name}
                                            </text>
                                            {showTypes && (
                                                <text
                                                    x={n.w - PAD_X}
                                                    y={y + Math.round(ROW_H * 0.68)}
                                                    textAnchor="end"
                                                    className="fill-muted-foreground"
                                                    style={{
                                                        fontSize: Math.round(DIAGRAM_FONT_PX * 0.88),
                                                        fontStyle: "italic"
                                                    }}
                                                >
                                                    {c.type}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}

export function SqliteWorkbench({open, onOpenChange, folderSlug, fileSlug, fileName}: SqliteWorkbenchProps) {
    const {toast} = useToast();
    const [tables, setTables] = React.useState<TableInfo[] | null>(null);
    /** Section 6,— the schema tree's index list + the
     *  write-mode toggle (default OFF, persisted per-browser). */
    const [indexes, setIndexes] = React.useState<IndexInfo[] | null>(null);
    const [writeMode, setWriteMode] = React.useState(false);
    /** Bumped after a successful write-mode mutation → re-fetch the
     *  schema (a CREATE/DROP changes the tree). */
    const [schemaNonce, setSchemaNonce] = React.useState(0);
    const [schemaError, setSchemaError] = React.useState<string | null>(null);
    const [sql, setSql] = React.useState("SELECT name, type FROM sqlite_master ORDER BY name");
    const [result, setResult] = React.useState<QueryResult | null>(null);
    const [queryError, setQueryError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [history, setHistory] = React.useState<string[]>([]);
    const [savedQueries, setSavedQueries] = React.useState<Array<{ label: string; sql: string }>>([]);
    const [view, setView] = React.useState<"sql" | "diagram">("sql");

    React.useEffect(() => {
        if (open) {
            setHistory(loadHistory());
            try {
                const raw = window.localStorage.getItem(`${HISTORY_KEY}:saved`);
                setSavedQueries(raw ? (JSON.parse(raw) as Array<{ label: string; sql: string }>) : []);
            } catch {
                setSavedQueries([]);
            }
            // WRITE MODE — defaults OFF, remembered per-browser. Off = the
            // server keeps the read-only URI and SQLite itself refuses
            // mutations.
            try {
                setWriteMode(window.localStorage.getItem(WRITE_KEY) === "1");
            } catch {
                setWriteMode(false);
            }
        }
    }, [open]);

    const toggleWriteMode = (on: boolean) => {
        setWriteMode(on);
        try {
            window.localStorage.setItem(WRITE_KEY, on ? "1" : "0");
        } catch {
            /* quota — session-only then */
        }
        toast({
            title: on ? "Write mode ON" : "Write mode off",
            description: on
                ? "INSERT / UPDATE / DELETE / CREATE / ALTER / DROP now execute for real against this database."
                : "Queries are read-only again (SELECT / PRAGMA / EXPLAIN).",
            variant: on ? "warning" : "default",
        });
    };

    // Load the schema whenever the target database changes (or after a
    // write-mode mutation bumped the nonce).
    React.useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setTables(null);
        setIndexes(null);
        setSchemaError(null);
        void (async () => {
            try {
                const res = await fetch(
                    `/api/sqlite-query?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}${interpreterQuery()}`
                );
                const json = await res.json();
                if (cancelled) return;
                if (!res.ok || !json.ok) {
                    setSchemaError(json.error ?? `HTTP ${res.status}`);
                    setTables([]);
                } else {
                    setTables(json.tables as TableInfo[]);
                    setIndexes(Array.isArray(json.indexes) ? (json.indexes as IndexInfo[]) : []);
                }
            } catch (err) {
                if (!cancelled) setSchemaError((err as Error).message);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, folderSlug, fileSlug, schemaNonce]);

    const runQuery = async (text?: string) => {
        const statement = (text ?? sql).trim();
        if (!statement) return;
        setBusy(true);
        setQueryError(null);
        setResult(null);
        try {
            const res = await fetch("/api/sqlite-query", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    file: fileSlug,
                    sql: statement,
                    // selected-env passthrough.
                    interpreter: configuredInterpreter(),
                    // WRITE MODE only true when the user turned the
                    //  toggle ON — the route then drops mode=ro.
                    write: writeMode === true,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                setQueryError(json.error ?? `HTTP ${res.status}`);
            } else {
                setResult({
                    columns: json.columns ?? [],
                    rows: json.rows ?? [],
                    truncated: json.truncated,
                    changes: json.changes
                });
                const next = [statement, ...history.filter((q) => q !== statement)].slice(0, 30);
                setHistory(next);
                saveHistory(next);
                // A successful write-mode MUTATION (no result columns → it was
                //  INSERT/UPDATE/DELETE/DDL) refreshes the schema tree — new
                //  tables/columns appear immediately.
                if (writeMode && (json.columns ?? []).length === 0) {
                    setSchemaNonce((n) => n + 1);
                }
            }
        } catch (err) {
            setQueryError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const persistSaved = (list: Array<{ label: string; sql: string }>) => {
        setSavedQueries(list);
        try {
            window.localStorage.setItem(`${HISTORY_KEY}:saved`, JSON.stringify(list.slice(0, 50)));
        } catch {
            /* quota — ignore */
        }
    };

    const pickTable = (name: string) => {
        setSql(`SELECT * FROM "${name}" LIMIT 100`);
        setView("sql");
        toast({
            title: "Query loaded",
            description: `SELECT * FROM "${name}" LIMIT 100 — press Run (Ctrl+↵).`,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <ResizableDialogContent id="sqlite-workbench" defaultW={1180} defaultH={740}
                                    className="overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Database className="size-4 text-emerald-500"/>
                        SQL Workbench — {fileName}
                    </DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-2">
                        {writeMode
                            ? "Write mode is ON — every statement executes for real (INSERT / UPDATE / DELETE / CREATE / ALTER / DROP included)."
                            : "Read-only queries against the project database (SELECT / PRAGMA / EXPLAIN). Writes are refused by the read-only connection."}
                        {/* ── WRITE-MODE TOGGLE — defaults OFF, remembered
             *  per-browser; ON drops the server-side mode=ro guard. */}
                        <label
                            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium cursor-pointer select-none"
                            title={
                                writeMode
                                    ? "Write mode is ON — turn it off to re-enable the read-only connection"
                                    : "Turn on write mode to allow INSERT / UPDATE / DELETE / CREATE / ALTER / DROP"
                            }
                        >
                            <input
                                type="checkbox"
                                checked={writeMode}
                                onChange={(e) => toggleWriteMode(e.target.checked)}
                                className="size-3 accent-red-500"
                                aria-label="Write mode — allow modifying statements"
                            />
                            <span className={writeMode ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                Write mode {writeMode ? "· ON" : "· off"}
              </span>
                        </label>
                    </DialogDescription>
                </DialogHeader>

                {/* View switcher — padded clear of the description above and
            the schema/query workspace below so the buttons never touch
            either block. */}
                <div className="flex items-center gap-1.5 shrink-0 pt-2 pb-3">
                    <Button
                        variant={view === "sql" ? "default" : "outline"}
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => setView("sql")}
                    >
                        <Table2 className="size-3.5"/> SQL query
                    </Button>
                    <Button
                        variant={view === "diagram" ? "default" : "outline"}
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => setView("diagram")}
                    >
                        <Network className="size-3.5"/> Schema diagram
                    </Button>
                    {view === "diagram" && tables && (
                        <Badge variant="secondary" className="text-[10px]">
                            {tables.filter((t) => t.type === "table").length} tables ·{" "}
                            {(tables ?? []).reduce((n, t) => n + (t.fks?.length ?? 0), 0)} relations
                        </Badge>
                    )}
                </div>

                {view === "diagram" ? (
                    <div className="flex flex-col min-h-0 flex-1 pt-1">
                        {schemaError && (
                            <p className="text-xs text-red-600 dark:text-red-400 mb-2">{schemaError}</p>
                        )}
                        {tables === null && !schemaError ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
                                <Loader2 className="size-3 animate-spin"/> Reading schema…
                            </div>
                        ) : (
                            <SchemaDiagram tables={tables ?? []} onPickTable={pickTable}/>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-[220px_1fr] gap-3 min-h-0 flex-1 pt-2">
                        {/* Schema tree */}
                        <div className="rounded-md border overflow-y-auto max-h-[52vh] p-2 space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Schema</p>
                            {schemaError && <p className="text-xs text-red-600 dark:text-red-400">{schemaError}</p>}
                            {tables === null && !schemaError && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Loader2 className="size-3 animate-spin"/> Reading schema…
                                </div>
                            )}
                            {tables?.map((t) => (
                                <div key={`${t.type}-${t.name}`} className="text-[13px]">
                                    <button
                                        type="button"
                                        className="w-full text-left font-medium hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1.5"
                                        onClick={() => setSql(`SELECT * FROM "${t.name}" LIMIT 100`)}
                                        title={`Click to load SELECT * FROM "${t.name}"`}
                                    >
                                        <Database className="size-3 text-muted-foreground shrink-0"/>
                                        <span className="truncate">{t.name}</span>
                                        {t.rows !== null && <Badge variant="secondary"
                                                                   className="ml-auto text-[10px] shrink-0">{t.rows}</Badge>}
                                    </button>
                                    {t.columns.length > 0 && (
                                        <ul className="pl-4 py-0.5 space-y-0.5">
                                            {t.columns.map((c) => (
                                                <li key={c.name} className="text-[11px] text-muted-foreground truncate">
                                                    {c.pk ? "🔑 " : ""}
                                                    {c.name} <span className="opacity-60">({c.type})</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}

                            {/* ── INDEXES in the schema tree every index
                  from PRAGMA index_list per table, grouped under its
                  table, with unique / origin badges and the covered
                  columns. Click loads its PRAGMA index_info query. */}
                            {(indexes ?? []).length > 0 && (
                                <div className="pt-1 border-t space-y-1" data-testid="schema-indexes">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                        <KeyRound className="size-3"/> Indexes ({(indexes ?? []).length})
                                    </p>
                                    {(indexes ?? []).map((idx) => (
                                        <button
                                            key={`${idx.table}-${idx.name}`}
                                            type="button"
                                            className="w-full text-left rounded px-1 py-0.5 hover:bg-muted/60 flex items-center gap-1.5"
                                            onClick={() => {
                                                const q = `PRAGMA index_info("${idx.name}")`;
                                                setSql(q);
                                                toast({
                                                    title: "Index query loaded",
                                                    description: `${q} — press Run (Ctrl+↵).`,
                                                });
                                            }}
                                            title={`PRAGMA index_info(\"${idx.name}\") — ${(idx.columns ?? []).join(", ")}`}
                                        >
                                            <KeyRound className="size-2.5 text-amber-500 shrink-0"/>
                                            <span className="text-[11px] font-mono truncate flex-1">{idx.name}</span>
                                            {idx.unique && (
                                                <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0"
                                                       title="UNIQUE index">
                                                    UNIQUE
                                                </Badge>
                                            )}
                                            {idx.origin && idx.origin !== "c" && (
                                                <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0"
                                                       title={`Implicit index from ${idx.origin === "u" ? "a UNIQUE constraint" : "the PRIMARY KEY"}`}>
                                                    {idx.origin === "u" ? "UQ" : "PK"}
                                                </Badge>
                                            )}
                                            <span
                                                className="text-[9px] text-muted-foreground shrink-0 truncate max-w-24"
                                                title={`On table ${idx.table}`}>
                        {idx.table}
                      </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Editor + results */}
                        <div className="space-y-2 min-w-0 flex flex-col">
              <textarea
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                          e.preventDefault();
                          void runQuery();
                      }
                  }}
                  placeholder="SELECT * FROM …"
                  className="w-full h-24 rounded-md border bg-muted/30 p-2 font-mono text-[13px] resize-none focus-visible:outline-none focus-visible:ring-1"
                  aria-label="SQL statement"
              />
                            <div className="flex flex-wrap items-center gap-2">
                                <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={busy}
                                        onClick={() => void runQuery()}>
                                    {busy ? <Loader2 className="size-3 animate-spin"/> : <Play className="size-3"/>}
                                    Run (Ctrl+↵)
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1.5 text-xs"
                                    onClick={() => {
                                        const label = window.prompt("Save this query as…", sql.slice(0, 40));
                                        if (label) persistSaved([{
                                            label: label.slice(0, 60),
                                            sql
                                        }, ...savedQueries.filter((q) => q.sql !== sql)]);
                                    }}
                                >
                                    <Save className="size-3"/>
                                    Save query
                                </Button>
                                {savedQueries.map((q) => (
                                    <Badge
                                        key={q.label}
                                        variant="outline"
                                        className="cursor-pointer hover:bg-muted gap-1"
                                        onClick={() => setSql(q.sql)}
                                        title={q.sql}
                                    >
                                        {q.label}
                                        <Trash2
                                            className="size-3 opacity-50 hover:opacity-100"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                persistSaved(savedQueries.filter((s) => s.label !== q.label));
                                            }}
                                        />
                                    </Badge>
                                ))}
                            </div>

                            {queryError && (
                                <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-md p-2">{queryError}</p>
                            )}

                            {result && (
                                <div className="rounded-md border overflow-auto max-h-[26vh]">
                                    {result.columns.length === 0 ? (
                                        <p className="text-xs text-muted-foreground p-3">
                                            Statement
                                            executed{result.changes !== undefined ? ` — rowcount ${result.changes}` : ""}.
                                        </p>
                                    ) : (
                                        <table
                                            className="w-full text-[13px] font-mono"
                                            role="grid"
                                            aria-rowcount={result.rows.length}
                                        >
                                            <thead className="sticky top-0 bg-muted">
                                            <tr className="[&>th]:border-b" role="row">
                                                {/* the row-INDEX column (plan §6 "index
display in the SQLite workbench") — every
result row is numbered, mirroring the
editor's line gutter. */}
                                                <th className="w-10 text-right font-normal text-muted-foreground px-2 py-1 border-b whitespace-nowrap"
                                                    aria-label="Row index">#
                                                </th>
                                                {result.columns.map((c) => (
                                                    <th key={c} role="columnheader"
                                                        className="text-left font-medium px-2 py-1 border-b whitespace-nowrap">{c}</th>
                                                ))}
                                            </tr>
                                            </thead>
                                            <tbody>
                                            {result.rows.map((row, i) => (
                                                <tr key={i} role="row" aria-rowindex={i + 1}
                                                    className={cn(i % 2 === 1 && "bg-muted/30")}>
                                                    <td className="text-right text-muted-foreground tabular-nums select-none px-2 py-1 border-b border-border/40 font-mono text-[13px]"
                                                        aria-label={`Row ${i + 1}`}>{i + 1}</td>
                                                    {row.map((cell, j) => (
                                                        <td key={j} role="gridcell"
                                                            className="px-2 py-1 border-b border-border/40 whitespace-nowrap font-mono text-[13px]">
                                                            {cell === null ? <span
                                                                className="text-muted-foreground italic">NULL</span> : String(cell)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {history.length > 0 && (
                                <details className="text-xs">
                                    <summary className="cursor-pointer text-muted-foreground">Recent queries
                                        ({history.length})
                                    </summary>
                                    <ul className="pl-3 space-y-1 py-1">
                                        {history.slice(0, 10).map((q) => (
                                            <li key={q}>
                                                <button type="button"
                                                        className="text-left font-mono text-[13px] hover:text-emerald-600 truncate"
                                                        onClick={() => setSql(q)}>
                                                    {q.slice(0, 90)}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </div>
                    </div>
                )}
            </ResizableDialogContent>
        </Dialog>
    );
}

// ─── Inline database file viewer ────────────────────────

/**
 * The viewer Praxis shows when a .db / .sqlite file is OPENED —
 * replaces the old "Unsupported file type" card. Renders a schema
 * overview (table cards with row counts, PK/FK-marked columns) and a
 * big "Open SQL workbench" button. All data comes from the read-only
 * /api/sqlite-query schema endpoint.
 */
export function DbFileViewer({
                                 folderSlug,
                                 fileSlug,
                                 fileName,
                                 onOpenWorkbench,
                                 fontScale = 1,
                             }: {
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    onOpenWorkbench?: () => void;
    /** The viewer toolbar's zoom multiplier — scales the whole card /
     *  report surface (the diagram tab carries its own zoom controls). */
    fontScale?: number;
}) {
    const [tables, setTables] = React.useState<TableInfo[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [reloadKey, setReloadKey] = React.useState(0);
    const [tab, setTab] = React.useState<"diagram" | "tables" | "relations" | "orm">("diagram");
    const [ormFlavor, setOrmFlavor] = React.useState<"sqlalchemy" | "django" | "prisma">("sqlalchemy");
    const {toast} = useToast();

    React.useEffect(() => {
        let cancelled = false;
        setTables(null);
        setError(null);
        void (async () => {
            try {
                const res = await fetch(
                    `/api/sqlite-query?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}${interpreterQuery()}`
                );
                const json = await res.json();
                if (cancelled) return;
                if (!res.ok || !json.ok) {
                    setError(json.error ?? `HTTP ${res.status}`);
                    setTables([]);
                } else {
                    setTables(json.tables as TableInfo[]);
                }
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [folderSlug, fileSlug, reloadKey]);

    const tableCount = tables?.filter((t) => t.type === "table").length ?? 0;
    const viewCount = tables?.filter((t) => t.type === "view").length ?? 0;
    const fkCount = (tables ?? []).reduce((n, t) => n + (t.fks?.length ?? 0), 0);
    const totalRows = (tables ?? []).reduce((n, t) => n + (t.rows ?? 0), 0);

    /* The live schema adapted to the ORM/report generators' table shape
     * (views skipped — they have no model). */
    const ormTables = React.useMemo(
        () =>
            (tables ?? [])
                .filter((t) => t.type === "table")
                .map((t) => ({
                    name: t.name,
                    type: "table" as const,
                    columns: t.columns.map((c) => ({name: c.name, type: c.type, pk: c.pk ?? false})),
                    rows: null,
                    fks: t.fks ?? [],
                })),
        [tables]
    );
    const relationsText = React.useMemo(() => relationsReportFromSchema(ormTables), [ormTables]);
    const ormCode = React.useMemo(
        () =>
            ormFlavor === "django"
                ? djangoModelsFromSchema(ormTables)
                : ormFlavor === "prisma"
                    ? prismaSchemaFromSchema(ormTables)
                    : sqlalchemyModelsFromSchema(ormTables),
        [ormTables, ormFlavor]
    );

    const copyText = (label: string, value: string) => {
        void navigator.clipboard?.writeText(value).then(() =>
            toast({title: `${label} copied`, variant: "success"})
        );
    };

    return (
        <div
            /* Full width — the same footprint the .sql schema viewer uses
             * (no max-w cap, no centering), so a wide editor pane shows the
             * diagram / card grid edge to edge. Zoom scales the WHOLE card
             * via the CSS zoom property: the card mixes absolute text-*
             * classes with em-based ones, so a font-size multiplier alone
             * never scaled everything — zoom multiplies every computed
             * length uniformly (fonts, paddings, badges, the diagram). */
            className="p-4 md:p-6 w-full"
            /* Font parity with the .sql source view (CodeViewSurface renders
             * 13×zoom px monospace): the root keeps 13px + CSS zoom so every
             * em-based text inside the .db card renders at the SAME effective
             * size as the .sql view — the primary content (table names,
             * column rows, results) reads identically in both viewers. */
            style={{fontSize: "13px", zoom: fontScale === 1 ? undefined : fontScale}}
        >
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <Database className="size-5 text-emerald-500"/>
                <div className="mr-auto">
                    <p className="text-sm font-semibold text-foreground">{fileName}</p>
                    <p className="text-[0.9em] text-muted-foreground">
                        SQLite database
                        {tables
                            ? ` — ${tableCount} table${tableCount === 1 ? "" : "s"}${
                                viewCount ? `, ${viewCount} view${viewCount === 1 ? "" : "s"}` : ""
                            }, ${fkCount} relation${fkCount === 1 ? "" : "s"}, ~${totalRows.toLocaleString()} rows`
                            : ""}
                    </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                        onClick={() => setReloadKey((k) => k + 1)}>
                    Refresh schema
                </Button>
                {onOpenWorkbench && (
                    <Button size="sm" className="gap-1.5 text-xs" onClick={onOpenWorkbench}
                            title="Open the SQL workbench — schema diagram + indexes + the query editor (write mode is a toggle, off by default)">
                        <Database className="size-3.5"/> Open SQL workbench
                    </Button>
                )}
            </div>

            {error && (
                <div
                    className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400 mb-4">
                    {error}
                </div>
            )}
            {tables === null && !error && (
                // Schema-shaped skeleton while the table list loads (matches
                // the FileSkeleton sqlite shape: a schema rail of table
                // headers + row bars) — replaced the bare spinner line so the
                // loading state reads as "content arriving", and it only
                // clears when the schema read succeeded (or errored).
                <div className="space-y-3" aria-busy="true" aria-label={`Reading schema for ${fileName}…`}>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
                        <Loader2 className="size-3.5 animate-spin"/> Reading schema for {fileName}…
                    </div>
                    <div className="flex gap-3">
                        <div className="w-44 shrink-0 space-y-2">
                            {Array.from({length: 5}).map((_, i) => (
                                <Skeleton key={`st-${i}`} className="h-6 w-full rounded"/>
                            ))}
                        </div>
                        <div className="flex-1 space-y-2">
                            {Array.from({length: 6}).map((_, i) => (
                                <Skeleton key={`sr-${i}`} className="h-4 rounded"
                                          style={{width: `${88 - ((i * 11) % 34)}%`}}/>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {tables && tables.length === 0 && !error && (
                <p className="text-xs text-muted-foreground py-8 text-center">
                    This database has no tables yet.
                </p>
            )}

            {/* The view-mode schema tabs — the .sql file viewer's graphical
          schema (diagram / relations / ORM) for LIVE .db databases: the
          same ER diagram the workbench renders, fed by the API's table
          list, with the card grid (tables) one tab away. */}
            {tables && tables.length > 0 && (
                <>
                    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 rounded-t-md">
                        <div className="flex overflow-hidden rounded-md border text-xs" role="tablist"
                             aria-label="Database view mode">
                            {(["diagram", "tables", "relations", "orm"] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === t}
                                    onClick={() => setTab(t)}
                                    className={cn(
                                        "px-3 py-1.5 transition-colors",
                                        tab === t ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium" : "text-muted-foreground hover:bg-muted/60"
                                    )}
                                >
                                    {t === "diagram"
                                        ? "Schema Diagram"
                                        : t === "tables"
                                            ? "Tables"
                                            : t === "relations"
                                                ? "Relations"
                                                : "ORM Models"}
                                </button>
                            ))}
                        </div>
                        {tab === "orm" && (
                            <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5"
                                 role="group" aria-label="ORM flavor">
                                {(["sqlalchemy", "django", "prisma"] as const).map((f) => (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setOrmFlavor(f)}
                                        aria-pressed={ormFlavor === f}
                                        title={f === "sqlalchemy" ? "SQLAlchemy 2.0 declarative models" : f === "django" ? "Django models with ForeignKey + Meta.db_table" : "Prisma schema with @relation pairs"}
                                        className={cn(
                                            "h-6 rounded px-2 text-[11px] font-medium transition-colors",
                                            ormFlavor === f
                                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                        )}
                                    >
                                        {f === "sqlalchemy" ? "SQLAlchemy" : f === "django" ? "Django" : "Prisma"}
                                    </button>
                                ))}
                            </div>
                        )}
                        {(tab === "orm" || tab === "relations") && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 text-xs"
                                onClick={() => copyText(tab === "orm" ? "ORM models" : "Relations report", tab === "orm" ? ormCode : relationsText)}
                                title={tab === "orm" ? `Copy the generated ${ormFlavor} output` : "Copy the relations report"}
                            >
                                Copy
                            </Button>
                        )}
                        <span className="ml-auto text-[0.95em] text-muted-foreground" title={fileName}>
              {tableCount} table{tableCount === 1 ? "" : "s"} · {fkCount} relation{fkCount === 1 ? "" : "s"}
                            {viewCount ? ` · ${viewCount} view${viewCount === 1 ? "" : "s"}` : ""}
            </span>
                    </div>

                    <div className="min-h-0 rounded-b-md">
                        {tab === "diagram" ? (
                            <SchemaDiagram tables={tables}/>
                        ) : tab === "relations" ? (
                            <pre className="p-4 font-mono text-[1em] whitespace-pre-wrap"
                                 aria-label="Foreign key relations">
                {relationsText}
              </pre>
                        ) : tab === "orm" ? (
                            <div className="space-y-2 p-3">
                                <p className="text-[0.85em] text-muted-foreground">
                                    {ormFlavor === "django"
                                        ? "Django models generated from this database's live schema — one model per table, ForeignKey fields with on_delete, Meta.db_table preserved (managed = False: the tables already exist). Copy into an app's models.py."
                                        : ormFlavor === "prisma"
                                            ? "Prisma schema generated from this database's live schema — models with @@map to the real table names, @relation pairs for every foreign key. Copy into schema.prisma with the sqlite provider."
                                            : "SQLAlchemy 2.0 declarative models generated from this database's live schema — one class per table, ForeignKey() columns and paired relationship()s. Copy into a models.py and adjust nullability to taste."}
                                </p>
                                <pre
                                    className="rounded-md border bg-muted/20 p-3 font-mono text-[1em] whitespace-pre-wrap"
                                    aria-label={`Generated ${ormFlavor} output`}>
                  {ormCode}
                </pre>
                            </div>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2 p-1">
                                {tables.map((t) => (
                                    <div key={`${t.type}-${t.name}`} className="rounded-lg border bg-card p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Table2 className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="text-[1em] font-semibold truncate">{t.name}</span>
                                            {t.type === "view" &&
                                              <Badge variant="outline" className="text-[9px] shrink-0">VIEW</Badge>}
                                            {t.rows !== null && (
                                                <Badge variant="secondary"
                                                       className="ml-auto text-[9px] shrink-0 tabular-nums">
                                                    {t.rows.toLocaleString()} rows
                                                </Badge>
                                            )}
                                        </div>
                                        <ul className="space-y-0.5">
                                            {t.columns.slice(0, 12).map((c) => (
                                                /* 1em = 13px root — the same effective size as the
                                                 * .sql source view's code lines (was 0.85em ≈ 11px,
                                                 * which made .db read noticeably smaller). */
                                                <li key={c.name} className="text-[1em] flex items-center gap-1.5">
                                                    {c.pk ? (
                                                        <KeyRound className="size-2.5 text-amber-500 shrink-0"/>
                                                    ) : (
                                                        (t.fks ?? []).some((f) => f.from === c.name) ? (
                                                            <Link2 className="size-2.5 text-sky-500 shrink-0"/>
                                                        ) : (
                                                            <span className="size-2.5 shrink-0"/>
                                                        )
                                                    )}
                                                    <span className="truncate">{c.name}</span>
                                                    <span
                                                        className="ml-auto text-muted-foreground italic shrink-0">{c.type}</span>
                                                </li>
                                            ))}
                                            {t.columns.length > 12 && (
                                                <li className="text-[0.9em] text-muted-foreground">+{t.columns.length - 12} more…</li>
                                            )}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
