"use client";

import * as React from "react";
import {
    Activity,
    ArrowLeftRight,
    BarChart3,
    Boxes,
    ChartArea,
    ChartBar,
    ChartBarStacked,
    ChartColumn,
    ChartColumnBig,
    ChartColumnStacked,
    ChartLine,
    ChartPie,
    ChartScatter,
    ChartSpline,
    CircleDot,
    Copy,
    Download,
    Dumbbell,
    Flower2,
    FolderInput,
    Grid2x2,
    Grid3x3,
    Info,
    Loader2,
    MoveDiagonal,
    PieChart,
    Radar,
    Sigma,
    TrendingUp,
    Waypoints,
} from "lucide-react";
import {Dialog, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {ResizableDialogContent} from "@/components/ui/resizable-dialog";
import {Button} from "@/components/ui/button";
import {Label} from "@/components/ui/label";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {useToast} from "@/hooks/use-toast";
import {parseCsv, separatorForExt} from "@/lib/csv-io";
import {fileUrlFor, takePrefetched} from "@/lib/prefetch";

/**
 * Chart Preview — pick the X column and one or more Y columns of the
 * current CSV/TSV and get an instant client-side chart.
 *
 * The figure catalog is organized as MENUS ▸ SUBMENUS: eight
 * categories (Trends · Bars · Distribution · Relationship ·
 * Proportion · Radial · Ranking · Statistics), each a submenu holding
 * several chart types — 39 renderers in all, every one pure SVG drawn
 * in the browser. Selecting a figure shows its NOTES (benefit + usage)
 * above the graph area. Each type also generates a matching matplotlib
 * snippet. No server round-trips beyond reading the file text.
 */

type IconType = typeof ChartLine;

export type ChartTypeId =
    | "line" | "spline" | "step" | "area" | "area-stacked" | "band"
    | "bar" | "bar-h" | "bar-grouped" | "bar-stacked" | "pareto" | "diverging"
    | "histogram" | "box" | "violin" | "beeswarm" | "ecdf" | "dotplot" | "ridgeline"
    | "scatter" | "scatter-trend" | "bubble" | "heatmap" | "connected" | "scatter-matrix"
    | "pie" | "donut" | "treemap" | "bar-100" | "waffle"
    | "radar" | "rose"
    | "lollipop" | "slope" | "bullet" | "parallel"
    | "qq" | "cumsum" | "rolling";

interface ChartTypeSpec {
    id: ChartTypeId;
    label: string;
    category: string;
    icon: IconType;
    /** One-line hint used in the menu tooltip. */
    hint: string;
    /** Why this figure helps — shown in the notes card above the chart. */
    benefit: string;
    /** How to read / drive it — shown in the notes card above the chart. */
    usage: string;
}

const CHART_TYPES: ChartTypeSpec[] = [
    // ── Trends ────────────────────────────────────────────────
    {
        id: "line",
        label: "Line",
        category: "Trends",
        icon: ChartLine,
        hint: "Straight segments through each (X, Y) point",
        benefit: "The default for ordered data — position along a line is the most accurately decoded visual channel, so small changes between neighboring rows are easy to spot.",
        usage: "Pick a time-like X column and one or more numeric Y columns; each selected Y draws its own line. Compare slopes, spikes and gaps across the row order."
    },
    {
        id: "spline",
        label: "Smoothed Line",
        category: "Trends",
        icon: ChartSpline,
        hint: "Catmull-Rom smoothed curve through the points",
        benefit: "Smooths visual noise so the underlying trajectory reads at a glance — the eye follows the trend instead of every jitter.",
        usage: "Use on noisy series (sensor readings, measurements). Keep at least ~8 rows; with fewer points the smoothing can invent hills."
    },
    {
        id: "step",
        label: "Step Line",
        category: "Trends",
        icon: TrendingUp,
        hint: "Step-after line — value holds until the next point",
        benefit: "Honest for values that hold between samples — prices, thresholds, state changes. A diagonal line would imply intermediate values that never existed.",
        usage: "Best when rows are events/changes, not continuous samples. Compare with the Line chart: if the two tell different stories, your data is step-like."
    },
    {
        id: "area", label: "Area", category: "Trends", icon: ChartArea, hint: "Line with the area under it filled",
        benefit: "Emphasizes magnitude and cumulative weight — the filled shape makes volume differences between series pop more than thin lines.",
        usage: "One or two positive series work best; pick the Y columns to compare and watch the filled regions. Avoid with mixed-sign data (area is misleading)."
    },
    {
        id: "area-stacked",
        label: "Stacked Area",
        category: "Trends",
        icon: ChartArea,
        hint: "Series stacked on top of each other, filled",
        benefit: "Shows each part's contribution AND the running total at once — the classic budget / traffic composition chart.",
        usage: "Select 2-4 components that sum to a meaningful whole. Read the top edge as the total; the band widths as each part's share."
    },
    {
        id: "band",
        label: "Line ± Band",
        category: "Trends",
        icon: ChartSpline,
        hint: "Rolling mean with a ±1σ shaded band around it",
        benefit: "Separates signal from noise — the center line is the smoothed trend, the band is the local spread, so outliers break the band visibly.",
        usage: "Pick one noisy numeric Y column. The band is a rolling ±1 standard deviation (window 7 rows); values outside it are your anomaly candidates."
    },
    // ── Bars ──────────────────────────────────────────────────
    {
        id: "bar",
        label: "Vertical Bars",
        category: "Bars",
        icon: ChartColumn,
        hint: "One bar per X row (first Y series)",
        benefit: "Length against a common baseline makes precise rank comparisons easy — the go-to for a handful of categories.",
        usage: "Pick a category X column and one numeric Y. Sort the data upstream for a ranked look; keep X labels short."
    },
    {
        id: "bar-h",
        label: "Horizontal Bars",
        category: "Bars",
        icon: ChartBar,
        hint: "Bars laid out left-to-right — long labels stay readable",
        benefit: "Horizontal layout gives category labels room to breathe — no cramped or rotated text, and ranking reads top-to-bottom naturally.",
        usage: "Pick a category X (labels can be long) and one numeric Y. Shows the top 24 rows; sort your data to control the order."
    },
    {
        id: "bar-grouped",
        label: "Grouped Bars",
        category: "Bars",
        icon: ChartColumnStacked,
        hint: "Side-by-side bars per X row, one per series",
        benefit: "Compares several series per category at exact values — best when the per-category differences matter more than the totals.",
        usage: "Select 2-4 numeric Y columns and a category X. Keep the category count small (≤12) or the groups blur together."
    },
    {
        id: "bar-stacked",
        label: "Stacked Bars",
        category: "Bars",
        icon: ChartBarStacked,
        hint: "Bars stacked per X row across the series",
        benefit: "Composition + total per category in one mark — each bar's full height is the row total, segments are the shares.",
        usage: "Select 2-4 Y columns that sum to a whole. Compare segment widths within a bar, and total heights across bars."
    },
    {
        id: "pareto", label: "Pareto", category: "Bars", icon: Activity, hint: "Sorted bars + cumulative-share line",
        benefit: "Surfaces the vital few: sorted bars show magnitude while the cumulative line shows how few categories cover most of the total (the 80/20 view).",
        usage: "Pick a category X and one numeric Y. Read where the line crosses 80% — the bars to its left are your priority list."
    },
    {
        id: "diverging",
        label: "Diverging Bars",
        category: "Bars",
        icon: ArrowLeftRight,
        hint: "Bars left/right of zero by deviation from the mean",
        benefit: "Turns raw values into over/under-performance — deviations from the column mean flip side, so outliers and laggards jump out.",
        usage: "Pick one numeric Y column and a category X. Bars right of the axis are above average (green), left are below (red). The axis is the mean, not zero."
    },
    // ── Distribution ──────────────────────────────────────────
    {
        id: "histogram",
        label: "Histogram",
        category: "Distribution",
        icon: ChartColumnBig,
        hint: "Binned counts of the first numeric Y column",
        benefit: "The shape of one variable — mode, skew, tails and gaps at a glance; the first chart to draw for any new numeric column.",
        usage: "Pick a single numeric Y column (the first selected drives the bins). Look for the peak, the spread, and whether there are two humps (bimodal)."
    },
    {
        id: "box",
        label: "Box Plot",
        category: "Distribution",
        icon: ChartColumn,
        hint: "Quartiles + whiskers + outliers per numeric column",
        benefit: "A compact five-number summary per column — median, spread, and outliers — so several columns can be compared in one strip.",
        usage: "Select 2-4 numeric Y columns. The box is the middle 50%, the line inside is the median, the dots are outliers. Compare medians and box widths."
    },
    {
        id: "violin",
        label: "Violin",
        category: "Distribution",
        icon: ChartColumn,
        hint: "Mirrored density shape per numeric column",
        benefit: "Shows the FULL distribution shape, not just quartiles — bimodality and tail weight that a box plot hides.",
        usage: "Select 2-4 numeric Y columns. Wide sections = many values at that level; pinches = rare values. A box plot inside a violin is the honest combo."
    },
    {
        id: "beeswarm",
        label: "Beeswarm",
        category: "Distribution",
        icon: ChartScatter,
        hint: "Every value as a jittered dot, per numeric column",
        benefit: "Every single observation stays visible — no binning, no summary statistics hiding clusters or repeated values.",
        usage: "Select 2-4 numeric Y columns. Dense stacks = repeated values; isolated dots = outliers. Best up to a few hundred rows per column."
    },
    {
        id: "ecdf",
        label: "ECDF",
        category: "Distribution",
        icon: TrendingUp,
        hint: "Empirical cumulative distribution per column",
        benefit: "The most honest distribution comparison — read exact percentiles (median at 50%, p90 at 90%) straight off the curve, no binning artifacts.",
        usage: "Select 2-4 numeric Y columns. Pick a y-value, trace right to the curve, then down: that fraction of rows is at or below it. Steeper = tighter spread."
    },
    {
        id: "dotplot",
        label: "Dot Plot",
        category: "Distribution",
        icon: CircleDot,
        hint: "Stacked dots — one dot per value, binned like a histogram",
        benefit: "A countable histogram — each dot is one row, so small samples stay exact (a 13-dot stack IS 13 rows, no bar to misread).",
        usage: "Pick one numeric Y column. Count dots for exact small-sample counts; use the histogram instead when rows number in the hundreds."
    },
    {
        id: "ridgeline",
        label: "Ridgeline",
        category: "Distribution",
        icon: ChartColumnBig,
        hint: "Offset density ridges — one per numeric column",
        benefit: "Overlapping density profiles reveal how columns shift against each other — the joyplot view of many distributions at once.",
        usage: "Select 2-4 numeric Y columns; each gets a half-density ridge, stacked top to bottom. Look for ridges sliding left/right (shifts) and width changes (spread)."
    },
    // ── Relationship ──────────────────────────────────────────
    {
        id: "scatter", label: "Scatter", category: "Relationship", icon: ChartScatter, hint: "Dots at each (X, Y) pair",
        benefit: "The definitive two-variable chart — correlation, clusters, gaps and outliers all visible in the raw point cloud.",
        usage: "Pick numeric X and Y columns (X numeric — not a label). Look for the direction of travel (up-right = positive), tightness (line-ness = strength), and lone dots."
    },
    {
        id: "scatter-trend",
        label: "Scatter + Trend",
        category: "Relationship",
        icon: TrendingUp,
        hint: "Scatter with a least-squares trend line",
        benefit: "Adds the summary to the evidence — the least-squares line encodes direction and rough strength while every point stays checkable.",
        usage: "Pick numeric X and Y. The amber line is the fitted trend; points far from it are residuals worth a second look. One bend? Try a different model, not a longer line."
    },
    {
        id: "bubble",
        label: "Bubble",
        category: "Relationship",
        icon: ChartScatter,
        hint: "Dots sized by a second numeric column",
        benefit: "Adds a third dimension by area — compare two positions AND a magnitude per row in a single mark.",
        usage: "Pick numeric X, then select two numeric Y columns: the first positions the bubbles, the second sizes them. Area (not diameter) encodes the value — big looks VERY big."
    },
    {
        id: "heatmap",
        label: "Heatmap",
        category: "Relationship",
        icon: Grid2x2,
        hint: "2D bin counts of two numeric columns",
        benefit: "Density where scatter turns to ink — thousands of points collapse into a color grid that still shows the hot zones.",
        usage: "Pick numeric X and Y columns. Bright cells = many rows with that (x, y) combination. Use when a scatter would be one solid blob."
    },
    {
        id: "connected",
        label: "Connected Scatter",
        category: "Relationship",
        icon: MoveDiagonal,
        hint: "Scatter dots joined in row order — a path through time",
        benefit: "Shows BOTH the correlation and the sequence — where the path doubles back, loops or jumps is the actual story (phase plots, trajectories).",
        usage: "Pick numeric X and Y (both numeric, rows in order). Follow the line from the start: loops = cycles, spikes = shocks, direction = co-movement."
    },
    {
        id: "scatter-matrix",
        label: "Scatter Matrix",
        category: "Relationship",
        icon: Grid3x3,
        hint: "Pairwise mini-scatters of up to four numeric columns",
        benefit: "A relationship map for MANY columns at once — every pair gets its own panel, so the interesting pair finds you.",
        usage: "Select 2-4 numeric Y columns; the matrix plots every pair (plus a per-column histogram on the diagonal). Scan for the panel with structure — that is your lead."
    },
    // ── Proportion ────────────────────────────────────────────
    {
        id: "pie", label: "Pie", category: "Proportion", icon: PieChart, hint: "Share of the total per X category",
        benefit: "A familiar whole-of-parts view — instantly communicates that these slices make up 100% to any audience.",
        usage: "Pick a category X and one numeric Y. Best with 3-6 slices; beyond that (or with near-equal slices) switch to bars — angle comparison degrades fast."
    },
    {
        id: "donut", label: "Donut", category: "Proportion", icon: ChartPie, hint: "Pie with the center punched out",
        benefit: "Same shares as a pie but calmer — the empty center removes the area overload and leaves room for a total in the middle.",
        usage: "Pick a category X and one numeric Y. The hole can hold the total; slices keep their labels. Same ≤6-slice advice as the pie."
    },
    {
        id: "treemap",
        label: "Treemap",
        category: "Proportion",
        icon: Boxes,
        hint: "Area-proportional nested rectangles",
        benefit: "Fits MANY more categories than a pie — area encodes share, so 20+ segments stay readable where a pie would collapse.",
        usage: "Pick a category X and one numeric Y. Bigger rectangle = bigger share; the top 14 categories are shown. Squares compare areas more reliably than pie angles."
    },
    {
        id: "bar-100",
        label: "100% Stacked Bar",
        category: "Proportion",
        icon: ChartBarStacked,
        hint: "One bar: each series' share of the row total",
        benefit: "One row's composition, normalized — every segment reads as a percentage of the whole, independent of the absolute total.",
        usage: "Select 2-4 numeric Y columns and any X. The single bar spans 0-100%; segment widths are each column's share of the row-wise total."
    },
    {
        id: "waffle",
        label: "Waffle",
        category: "Proportion",
        icon: Grid3x3,
        hint: "A 10×10 grid of squares — one square per 1% of the total",
        benefit: "Countable proportion — each square is literally 1%, so a quarter becomes exactly 25 countable squares; great for reports.",
        usage: "Pick a category X and one numeric Y. The top categories fill the 100-square grid in whole-percent steps. Best for ≤5 categories with clean shares."
    },
    // ── Radial ──────────────────────────────────────────────
    {
        id: "radar",
        label: "Radar",
        category: "Radial",
        icon: Radar,
        hint: "One polygon per series across the X categories",
        benefit: "Multi-metric profiles in one glyph — compare overall shapes (bigger area = stronger overall) and spikes per axis.",
        usage: "Pick a category X (the axes — ≤10 works) and 2-3 numeric Y columns (the polygons). Compare shapes, not exact vertex values."
    },
    {
        id: "rose",
        label: "Nightingale Rose",
        category: "Radial",
        icon: Flower2,
        hint: "Polar area — equal-angle wedges sized by value",
        benefit: "A polar alternative to the bar chart — wedge AREA encodes value, so highs glow and lows nearly vanish; periodic categories (months, hours) suit the circle.",
        usage: "Pick a category X (ideally a cycle: months, weekdays, compass points) and one numeric Y. Wedge length ∝ value; compare neighbor wedges around the ring."
    },
    // ── Ranking ──────────────────────────────────────────────
    {
        id: "lollipop",
        label: "Lollipop",
        category: "Ranking",
        icon: Activity,
        hint: "A dot on a stick per category — a lighter bar chart",
        benefit: "Ranks like a bar chart with far less ink — the thin stems keep order while the dots mark exact values, so many rows stay clean.",
        usage: "Pick a category X and one numeric Y. The dot is the value, the stem anchors it to the axis. Great when 15-25 rows would crowd real bars."
    },
    {
        id: "slope",
        label: "Slope Graph",
        category: "Ranking",
        icon: Dumbbell,
        hint: "Each series' first value vs its last, joined",
        benefit: "Pure change story — first-to-last lines make who went up, who went down, who crossed readable in one second.",
        usage: "Pick one or more numeric Y columns; each draws a line from its first row value to its last. Steep = big change; crossings = rank swaps."
    },
    {
        id: "bullet",
        label: "Bullet",
        category: "Ranking",
        icon: ChartColumn,
        hint: "Value bar against the column-mean target marker",
        benefit: "Value vs benchmark in one compact row — the marker is the reference (column mean) and the bar shows where each category actually landed.",
        usage: "Pick a category X and one numeric Y. Bars past the amber marker beat the average; short of it, they lag. Sort data upstream for a report-ready stack."
    },
    {
        id: "parallel",
        label: "Parallel Coordinates",
        category: "Ranking",
        icon: Waypoints,
        hint: "One polyline per row across every numeric column",
        benefit: "More than 3 dimensions on a flat screen — each row becomes a thread across the selected columns, and patterns, bundles and outsiders appear in the weave.",
        usage: "Select 2-4 numeric Y columns (each becomes a vertical axis). Threads that move together = correlated rows; a thread that zigzags = interesting row."
    },
    // ── Statistics ─────────────────────────────────────────
    {
        id: "qq",
        label: "Normal Q-Q",
        category: "Statistics",
        icon: Sigma,
        hint: "Sample quantiles vs theoretical normal quantiles",
        benefit: "The straightest possible normality check — points ON the line mean the column is Gaussian; systematic bows mean skew, S-shapes mean heavy tails.",
        usage: "Pick one numeric Y column. Straight line = normal-ish; curved = skewed; corners off the line = outliers. Run this before any test that assumes normality."
    },
    {
        id: "cumsum",
        label: "Cumulative Sum",
        category: "Statistics",
        icon: Sigma,
        hint: "Running total of the first Y column across rows",
        benefit: "Turns deltas into stock — a running sum reveals drift, regimes and the moment the trend breaks, invisible in the raw up/down of the original series.",
        usage: "Pick one numeric Y column. Up-slope periods = consistently positive values; flats = neutral; drops = losing ground. Compare with the plain Line to see the signal emerge."
    },
    {
        id: "rolling",
        label: "Rolling Mean",
        category: "Statistics",
        icon: TrendingUp,
        hint: "7-row moving average per selected Y column",
        benefit: "A low-pass view of noisy series — the moving average keeps the trend, drops the jitter, and makes seasonality visible as gentle waves.",
        usage: "Select one or more numeric Y columns. The smooth line is the 7-row mean; deviations from it are short-lived noise. Watch for the lag at sharp turns."
    },
];

const CATEGORIES: Array<{ id: string; label: string; icon: IconType; blurb: string }> = [
    {id: "Trends", label: "Trends", icon: ChartLine, blurb: "Lines, steps, areas and bands over the row order"},
    {id: "Bars", label: "Bars", icon: ChartColumn, blurb: "Vertical, horizontal, grouped, stacked, Pareto, diverging"},
    {
        id: "Distribution",
        label: "Distribution",
        icon: ChartColumnBig,
        blurb: "Histogram, box, violin, beeswarm, ECDF, dots, ridges"
    },
    {
        id: "Relationship",
        label: "Relationship",
        icon: ChartScatter,
        blurb: "Scatter, trend, bubble, heatmap, path, matrix"
    },
    {id: "Proportion", label: "Proportion", icon: PieChart, blurb: "Pie, donut, treemap, 100% bar, waffle"},
    {id: "Radial", label: "Radial", icon: Radar, blurb: "Radar polygons and Nightingale roses"},
    {id: "Ranking", label: "Ranking", icon: Activity, blurb: "Lollipops, slopes, bullets, parallel coordinates"},
    {id: "Statistics", label: "Statistics", icon: Sigma, blurb: "Q-Q plot, cumulative sum, rolling mean"},
];

function specOf(id: ChartTypeId): ChartTypeSpec {
    return CHART_TYPES.find((t) => t.id === id) ?? CHART_TYPES[0];
}

interface ChartPreviewProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
}

const SERIES_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];
const HEAT_STOPS = ["#0e7490", "#10b981", "#f59e0b", "#ef4444"];

function toNumber(v: string): number | null {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

function fmt(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e4) return `${(v / 1e3).toFixed(0)}k`;
    if (a >= 100) return v.toFixed(0);
    if (a >= 1) return v.toFixed(1);
    return v.toFixed(2);
}

/** Quantile of a SORTED numeric array (linear interpolation). */
function quantile(sorted: number[], q: number): number {
    if (sorted.length === 0) return 0;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

/** Catmull-Rom spline path through points. */
function splinePath(pts: Array<{ x: number; y: number }>): string {
    if (pts.length < 3) return "M" + pts.map((p) => `${p.x},${p.y}`).join(" L");
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
    }
    return d;
}

/** Squared treemap slice-and-dice layout. */
function treemapSlices(
    items: Array<{ label: string; value: number }>,
    x: number,
    y: number,
    w: number,
    h: number
): Array<{ label: string; value: number; x: number; y: number; w: number; h: number }> {
    const out: Array<{ label: string; value: number; x: number; y: number; w: number; h: number }> = [];
    let cx = x, cy = y, cw = w, ch = h;
    const rest = [...items];
    while (rest.length) {
        const it = rest.shift()!;
        if (rest.length === 0) {
            out.push({...it, x: cx, y: cy, w: cw, h: ch});
            break;
        }
        const total = rest.reduce((s, r) => s + r.value, 0) + it.value;
        const share = it.value / total;
        if (cw >= ch) {
            const iw = cw * share;
            out.push({...it, x: cx, y: cy, w: iw, h: ch});
            cx += iw;
            cw -= iw;
        } else {
            const ih = ch * share;
            out.push({...it, x: cx, y: cy, w: cw, h: ih});
            cy += ih;
            ch -= ih;
        }
    }
    return out;
}

export function ChartPreview({open, onOpenChange, folderSlug, fileSlug, fileName}: ChartPreviewProps) {
    const {toast} = useToast();
    const [text, setText] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [xCol, setXCol] = React.useState(0);
    const [yCols, setYCols] = React.useState<number[]>([]);
    const [kind, setKind] = React.useState<ChartTypeId>("line");
    const chartSvgRef = React.useRef<SVGSVGElement | null>(null);

    React.useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setText(null);
        setError(null);
        void (async () => {
            try {
                const url = fileUrlFor(folderSlug, fileSlug);
                const res = await (takePrefetched(url) ?? fetch(url));
                // /api/file returns the RAW file bytes — read as text.
                const body = await res.text();
                if (cancelled) return;
                if (!res.ok) {
                    setError(`HTTP ${res.status}`);
                } else {
                    setText(body);
                }
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, folderSlug, fileSlug]);

    // TSV files split on tabs (separatorForExt), not commas.
    const parsed = React.useMemo(
        () => (text ? parseCsv(text, separatorForExt(fileName.slice(fileName.lastIndexOf(".")))) : null),
        [text, fileName]
    );

    // Auto-select: first numeric column(s) for Y; first column for X.
    React.useEffect(() => {
        if (!parsed || parsed.headers.length === 0) return;
        const numericIdx: number[] = [];
        for (let i = 0; i < parsed.headers.length && numericIdx.length < 2; i++) {
            const sample = parsed.rows.slice(0, 50).map((r) => toNumber(r[i] ?? ""));
            const hits = sample.filter((n) => n !== null).length;
            if (sample.length > 0 && hits / sample.length >= 0.8) numericIdx.push(i);
        }
        setXCol(0);
        setYCols(numericIdx.length > 0 ? numericIdx.slice(0, 2) : parsed.headers.length > 1 ? [1] : [0]);
    }, [parsed]);

    /** The selected Y columns as numeric arrays (non-numeric dropped). */
    const numericSeries = React.useMemo(() => {
        if (!parsed) return [];
        return yCols
            .filter((c) => c < parsed.headers.length)
            .map((col) => ({
                col,
                header: parsed.headers[col] ?? `col ${col}`,
                values: parsed.rows
                    .map((r) => toNumber(r[col] ?? ""))
                    .filter((v): v is number => v !== null),
            }))
            .filter((s) => s.values.length > 0);
    }, [parsed, yCols]);

    const seriesList = React.useMemo(() => {
        if (!parsed) return [];
        return yCols
            .filter((c) => c < parsed.headers.length)
            .map((col) => {
                const points = parsed.rows
                    .map((r) => ({
                        x: toNumber(r[xCol] ?? "") ?? Number.NaN,
                        y: toNumber(r[col] ?? ""),
                        label: (r[xCol] ?? "").trim(),
                    }))
                    .filter((p) => p.y !== null);
                return {col, header: parsed.headers[col] ?? `col ${col}`, points};
            });
    }, [parsed, xCol, yCols]);

    /** Category aggregation for proportion charts: first Y summed per X label. */
    const categoryAgg = React.useMemo(() => {
        if (!parsed || seriesList.length === 0) return [];
        const s = seriesList[0];
        const map = new Map<string, number>();
        for (const p of s.points) {
            const key = p.label || "—";
            map.set(key, (map.get(key) ?? 0) + (p.y as number));
        }
        return [...map.entries()]
            .map(([label, value]) => ({label, value}))
            .sort((a, b) => b.value - a.value)
            .slice(0, 14);
    }, [parsed, seriesList]);

    const bounds = React.useMemo(() => {
        const ys = seriesList.flatMap((s) => s.points.map((p) => p.y as number));
        if (ys.length === 0) return null;
        return {
            yMin: Math.min(...ys),
            yMax: Math.max(...ys),
            n: ys.length,
        };
    }, [seriesList]);

    /* ── Delivery helpers — the chart itself is exportable, not just
   *    the matplotlib snippet. The live <svg> is serialized (with
   *    explicit width/height so rasterizers don't collapse it), then
   *    rasterized to a PNG canvas at 2× for crisp text. */
    const serializeChartSvg = React.useCallback((): string | null => {
        const svg = chartSvgRef.current;
        if (!svg) return null;
        const clone = svg.cloneNode(true) as SVGSVGElement;
        const vb = svg.viewBox.baseVal;
        const w = vb && vb.width > 0 ? vb.width : svg.getBoundingClientRect().width || 560;
        const h = vb && vb.height > 0 ? vb.height : svg.getBoundingClientRect().height || 300;
        clone.setAttribute("width", String(w));
        clone.setAttribute("height", String(h));
        clone.removeAttribute("class");
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        // Inline the CURRENT app text color so labels/legend survive
        // outside the app (currentColor resolves at raster time).
        const color = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim() || "#18181b";
        clone.setAttribute("color", color);
        clone.querySelectorAll("[fill=\"currentColor\"]").forEach((n) => n.setAttribute("fill", color));
        return new XMLSerializer().serializeToString(clone);
    }, []);

    const chartPngBlob = React.useCallback(async (): Promise<Blob | null> => {
        const src = serializeChartSvg();
        if (!src) return null;
        const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
        const img = new Image();
        img.decoding = "sync";
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("The chart could not be rasterized."));
            img.src = url;
        });
        const vb = chartSvgRef.current?.viewBox.baseVal;
        const W = (vb && vb.width > 0 ? vb.width : 560) * 2;
        const H = (vb && vb.height > 0 ? vb.height : 300) * 2;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(W));
        canvas.height = Math.max(1, Math.round(H));
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.95));
    }, [serializeChartSvg]);

    const baseName = React.useMemo(() => fileName.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-") || "chart", [fileName]);
    const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/T|(\.\d{3}Z)/g, "").slice(0, 14);

    const copyChartImage = async () => {
        try {
            const blob = await chartPngBlob();
            if (!blob) throw new Error("The chart is not rendered yet.");
            if (!("ClipboardItem" in window) || !navigator.clipboard?.write) {
                throw new Error("This browser cannot paste images from the clipboard — use Download instead.");
            }
            await navigator.clipboard.write([new ClipboardItem({"image/png": blob})]);
            toast({title: "Chart image copied", description: "Paste anywhere as a PNG image.", variant: "success"});
        } catch (err) {
            toast({title: "Copy failed", description: (err as Error).message, variant: "destructive"});
        }
    };

    const downloadPng = async () => {
        try {
            const blob = await chartPngBlob();
            if (!blob) throw new Error("The chart is not rendered yet.");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${baseName}-chart.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(a.href);
            toast({title: "Chart downloaded", description: `${baseName}-chart.png`, variant: "success"});
        } catch (err) {
            toast({title: "Download failed", description: (err as Error).message, variant: "destructive"});
        }
    };

    const downloadSvg = () => {
        const src = serializeChartSvg();
        if (!src) {
            toast({title: "Download failed", description: "The chart is not rendered yet.", variant: "destructive"});
            return;
        }
        const blob = new Blob([src], {type: "image/svg+xml"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${baseName}-chart.svg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        toast({title: "Chart downloaded", description: `${baseName}-chart.svg (vector)`, variant: "success"});
    };

    const saveChartToFile = async () => {
        try {
            const blob = await chartPngBlob();
            if (!blob) throw new Error("The chart is not rendered yet.");
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(fr.result as string);
                fr.onerror = () => reject(new Error("The chart bytes could not be read."));
                fr.readAsDataURL(blob);
            });
            const res = await fetch("/api/screenshot-save", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({path: `Charts/${baseName}-chart-${stamp()}.png`, dataUrl}),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            toast({
                title: "Chart saved into the project",
                description: data.path ?? `Charts/${baseName}-chart.png`,
                variant: "success"
            });
        } catch (err) {
            toast({title: "Save failed", description: (err as Error).message, variant: "destructive"});
        }
    };

    /** The matplotlib snippet for the CURRENT chart type. */
    const copyScript = () => {
        if (!parsed) return;
        const xName = parsed.headers[xCol] ?? "x";
        const yNames = seriesList.map((s) => s.header);
        const yIdx = seriesList.map((s) => s.col);
        const head = [
            "import csv",
            "import matplotlib.pyplot as plt",
            "",
            `# Data: ${fileName} — columns ${xName} (X) vs ${yNames.join(", ")} (Y)`,
            "with open(",
            `    ${JSON.stringify(fileName)},`,
            '    newline="", encoding="utf-8",',
            ") as f:",
            "    rows = list(csv.reader(f))",
            "headers = rows[0]",
            `xIndex, yIndices = ${xCol}, [${yIdx.join(", ")}]`,
            "",
        ];
        const readY = (col: string) =>
            [
                "def col(idx):",
                "    out = []",
                "    for r in rows[1:] if idx < len(r) else []:",
                "        try:",
                "            out.append(float(r[idx]))",
                "        except (ValueError, IndexError):",
                "            pass",
                "    return out",
                "",
            ];
        const body: string[] = [];
        const legendShow = "ax.legend()";
        const tickBlock = (xsVar: string) => [
            `if len(set(${xsVar})) == len(${xsVar}):`,
            `    step = max(1, len(${xsVar}) // 10)`,
            "    ax.set_xticks(range(0, len(xs), step))",
            `    ax.set_xticklabels([str(x) for x in ${xsVar}[::step]], rotation=30, ha=\"right\")`,
        ];
        switch (kind) {
            case "line":
            case "spline":
            case "step":
            case "area":
            case "area-stacked": {
                body.push(
                    "xs = [r[xIndex] for r in rows[1:]]",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    "for col_i in yIndices:",
                    "    ys = col(col_i)",
                    kind === "spline"
                        ? "    ax.plot(range(len(ys)), ys, label=headers[col_i], marker=\"o\", markersize=3, linestyle=\"-\")  # smoothed look"
                        : kind === "step"
                            ? "    ax.step(range(len(ys)), ys, where=\"post\", label=headers[col_i])"
                            : kind === "area"
                                ? "    ax.fill_between(range(len(ys)), ys, alpha=0.35, label=headers[col_i])"
                                : kind === "area-stacked"
                                    ? "ax.stackplot(range(len(col(yIndices[0]))), *[col(i) for i in yIndices], labels=[headers[i] for i in yIndices], alpha=0.85)"
                                    : "    ax.plot(range(len(ys)), ys, label=headers[col_i], marker=\"o\", markersize=3)",
                    ...tickBlock("xs"),
                    legendShow,
                );
                break;
            }
            case "bar":
            case "bar-h":
            case "bar-grouped":
            case "bar-stacked":
            case "pareto": {
                body.push(
                    "xs = [r[xIndex] for r in rows[1:]]",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    kind === "bar-h"
                        ? "ax.barh(range(len(col(yIndices[0]))), col(yIndices[0]))"
                        : kind === "bar-grouped"
                            ? "w = 0.8 / len(yIndices)\nfor k, col_i in enumerate(yIndices):\n    ax.bar([i + k*w for i in range(len(col(col_i)))], col(col_i), width=w, label=headers[col_i])"
                            : kind === "bar-stacked"
                                ? "bottom = [0]*len(col(yIndices[0]))\nfor col_i in yIndices:\n    ys = col(col_i)\n    ax.bar(range(len(ys)), ys, bottom=bottom[:len(ys)], label=headers[col_i])\n    bottom = [b + y for b, y in zip(bottom, ys)]"
                                : kind === "pareto"
                                    ? "vals = sorted(col(yIndices[0]), reverse=True)\ncum = [v/sum(vals) for v in __import__(\"itertools\").accumulate(vals)]\nax.bar(range(len(vals)), vals)\nax2 = ax.twinx()\nax2.plot(range(len(vals)), [c*100 for c in cum], color=\"#d97706\", marker=\"o\")\nax2.set_ylabel(\"cumulative %\")"
                                    : "ax.bar(range(len(col(yIndices[0]))), col(yIndices[0]))",
                    ...tickBlock("xs"),
                    ...(kind === "bar-grouped" || kind === "bar-stacked" ? [legendShow] : []),
                );
                break;
            }
            case "histogram": {
                body.push(...readY("hist"), "fig, ax = plt.subplots(figsize=(8, 4))", "ax.hist(col(yIndices[0]), bins=20)", "ax.set_ylabel(\"count\")");
                break;
            }
            case "box": {
                body.push(...readY("box"), "fig, ax = plt.subplots(figsize=(8, 4))", "ax.boxplot([col(i) for i in yIndices], tick_labels=[headers[i] for i in yIndices])");
                break;
            }
            case "violin": {
                body.push(...readY("violin"), "fig, ax = plt.subplots(figsize=(8, 4))", "ax.violinplot([col(i) for i in yIndices], showmedians=True)", "ax.set_xticks(range(1, len(yIndices) + 1), [headers[i] for i in yIndices])");
                break;
            }
            case "beeswarm": {
                body.push(
                    ...readY("swarm"),
                    "import random",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    "for k, col_i in enumerate(yIndices, start=1):",
                    "    ys = col(col_i)",
                    "    xs = [k + random.uniform(-0.18, 0.18) for _ in ys]",
                    "    ax.scatter(xs, ys, s=12, alpha=0.8)",
                    "ax.set_xticks(range(1, len(yIndices) + 1), [headers[i] for i in yIndices])",
                );
                break;
            }
            case "ecdf": {
                body.push(
                    ...readY("ecdf"),
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    "for col_i in yIndices:",
                    "    ys = sorted(col(col_i))",
                    "    ax.plot(ys, [ (i + 1) / len(ys) for i in range(len(ys)) ], label=headers[col_i])",
                    legendShow,
                );
                break;
            }
            case "scatter":
            case "scatter-trend":
            case "bubble": {
                body.push(
                    "pts = [(float(r[xIndex]), float(r[yIndices[0]])) for r in rows[1:]",
                    "        if len(r) > max(xIndex, yIndices[0])",
                    "        and r[xIndex].strip() and r[yIndices[0]].strip()",
                    "        and r[xIndex].strip().lstrip(\"-\").replace(\".\", \"\", 1).replace(\"-\", \"\").isdigit()",
                    "        and r[yIndices[0]].strip().lstrip(\"-\").replace(\".\", \"\", 1).replace(\"-\", \"\").isdigit()]",
                    "xs = [p[0] for p in pts]",
                    "ys = [p[1] for p in pts]",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    kind === "bubble"
                        ? "sizes = col(yIndices[1]) if len(yIndices) > 1 else ys\nax.scatter(xs, ys, s=[max(8, v) for v in sizes[:len(ys)]], alpha=0.6)"
                        : "ax.scatter(xs, ys, s=14, alpha=0.8)",
                    ...(kind === "scatter-trend"
                        ? [
                            "if len(xs) > 1:",
                            "    n = len(xs)",
                            "    b = sum((x - sum(xs)/n) * (y - sum(ys)/n) for x, y in zip(xs, ys)) / sum((x - sum(xs)/n) ** 2 for x in xs)",
                            "    a = sum(ys)/n - b * sum(xs)/n",
                            "    lo, hi = min(xs), max(xs)",
                            "    ax.plot([lo, hi], [a + b*lo, a + b*hi], color=\"#d97706\")",
                        ]
                        : []),
                    `ax.set_xlabel(${JSON.stringify(xName)})`,
                    `ax.set_ylabel(${JSON.stringify(yNames[0] ?? "y")})`,
                );
                break;
            }
            case "heatmap": {
                body.push(
                    ...readY("heat"),
                    "import math",
                    "pts = [(float(r[xIndex]), float(r[yIndices[0]])) for r in rows[1:]",
                    "        if len(r) > max(xIndex, yIndices[0])",
                    "        and r[xIndex].strip().lstrip(\"-\").replace(\".\", \"\", 1).replace(\"-\", \"\").isdigit()",
                    "        and r[yIndices[0]].strip().lstrip(\"-\").replace(\".\", \"\", 1).replace(\"-\", \"\").isdigit()]",
                    "xs = [p[0] for p in pts]; ys = [p[1] for p in pts]",
                    "NX, NY = 12, 8",
                    "x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)",
                    "grid = [[0]*NX for _ in range(NY)]",
                    "for x, y in pts:",
                    "    i = min(NX - 1, int((x - x0) / ((x1 - x0) or 1) * NX))",
                    "    j = min(NY - 1, int((y - y0) / ((y1 - y0) or 1) * NY))",
                    "    grid[NY - 1 - j][i] += 1",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    "ax.imshow(grid, cmap=\"YlGnBu\", aspect=\"auto\")",
                );
                break;
            }
            case "pie":
            case "donut": {
                body.push(
                    "from collections import defaultdict",
                    "agg = defaultdict(float)",
                    "for r in rows[1:]:",
                    "    try:",
                    "        agg[r[xIndex]] += float(r[yIndices[0]])",
                    "    except (ValueError, IndexError):",
                    "        pass",
                    "items = sorted(agg.items(), key=lambda kv: -kv[1])",
                    "fig, ax = plt.subplots(figsize=(6, 6))",
                    kind === "donut"
                        ? "ax.pie([v for _, v in items], labels=[k for k, _ in items], wedgeprops={\"width\": 0.42}, autopct=\"%1.1f%%\")"
                        : "ax.pie([v for _, v in items], labels=[k for k, _ in items], autopct=\"%1.1f%%\")",
                );
                break;
            }
            case "treemap": {
                body.push(
                    ...readY("tree"),
                    "from collections import defaultdict",
                    "agg = defaultdict(float)",
                    "for r in rows[1:]:",
                    "    try:",
                    "        agg[r[xIndex]] += float(r[yIndices[0]])",
                    "    except (ValueError, IndexError):",
                    "        pass",
                    "items = sorted(agg.items(), key=lambda kv: -kv[1])[:14]",
                    "try:",
                    "    import squarify",
                    "    fig, ax = plt.subplots(figsize=(8, 4.5))",
                    "    squarify.plot([v for _, v in items], label=[k for k, _ in items], ax=ax, alpha=0.85)",
                    "except ImportError:",
                    "    print(\"pip install squarify  # treemap needs the squarify package\")",
                );
                break;
            }
            case "bar-100": {
                body.push(
                    ...readY("pct"),
                    "fig, ax = plt.subplots(figsize=(8, 2.4))",
                    "totals = [sum(vals) for vals in zip(*[col(i) for i in yIndices])] or [1]",
                    "left = 0.0",
                    "for col_i in yIndices:",
                    "    ys = col(col_i)[:len(totals)]",
                    "    share = [ (v / t if t else 0.0) * 100 for v, t in zip(ys, totals) ]",
                    "    ax.barh([0], [sum(share)], left=[left], height=0.5, label=headers[col_i])",
                    "    left += sum(share)",
                    "ax.set_yticks([])",
                    "ax.set_xticks([0, 25, 50, 75, 100], [\"0%\", \"25%\", \"50%\", \"75%\", \"100%\"])",
                    legendShow,
                );
                break;
            }
            case "radar": {
                body.push(
                    "import numpy as np",
                    "cats = list(dict.fromkeys(r[xIndex] for r in rows[1:]))[:12]",
                    "fig = plt.figure(figsize=(6, 6))",
                    "ax = fig.add_subplot(polar=True)",
                    "angles = np.linspace(0, 2 * np.pi, len(cats), endpoint=False).tolist()",
                    "angles += angles[:1]",
                    "for col_i in yIndices:",
                    "    agg = {}",
                    "    for r in rows[1:]:",
                    "        try:",
                    "            agg[r[xIndex]] = float(r[col_i])",
                    "        except (ValueError, IndexError):",
                    "            pass",
                    "    vals = [agg.get(c, 0.0) for c in cats]",
                    "    vals += vals[:1]",
                    "    ax.plot(angles, vals, label=headers[col_i])",
                    "ax.set_xticks(angles[:-1], cats)",
                    legendShow,
                );
                break;
            }
            case "band": {
                body.push(
                    ...readY("band"),
                    "import statistics",
                    "ys = col(yIndices[0])",
                    "window = 7",
                    "mean = [statistics.mean(ys[max(0, i - window + 1): i + 1]) for i in range(len(ys))]",
                    "sd = [statistics.pstdev(ys[max(0, i - window + 1): i + 1]) for i in range(len(ys))]",
                    "xs = list(range(len(ys)))",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    "ax.plot(xs, mean, label=headers[yIndices[0]])",
                    "ax.fill_between(xs, [m - s for m, s in zip(mean, sd)], [m + s for m, s in zip(mean, sd)], alpha=0.25)",
                    legendShow,
                );
                break;
            }
            case "diverging": {
                body.push(
                    ...readY("diverging"),
                    "import statistics",
                    "ys = col(yIndices[0])",
                    "mu = statistics.mean(ys)",
                    "dev = [y - mu for y in ys]",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    "ax.bar(range(len(dev)), dev, color=[\"#10b981\" if d >= 0 else \"#ef4444\" for d in dev])",
                    "ax.axhline(0, color=\"#71717a\", linewidth=0.8)",
                    "ax.set_ylabel(f\"deviation from mean {mu:.2f}\")",
                    ...tickBlock("xs"),
                );
                break;
            }
            case "dotplot": {
                body.push(
                    ...readY("dotplot"),
                    "ys = col(yIndices[0])",
                    "lo, hi = min(ys), max(ys)",
                    "bins = [lo + (hi - lo) * i / 18 for i in range(19)]",
                    "counts = [0] * 18",
                    "for y in ys:",
                    "    b = min(17, int((y - lo) / ((hi - lo) or 1) * 18))",
                    "    counts[b] += 1",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    "for b, c in enumerate(counts):",
                    "    if c:",
                    "        ax.scatter([bins[b]] * c, list(range(1, c + 1)), s=14)",
                    "ax.set_xlabel(headers[yIndices[0]])",
                    "ax.set_ylabel(\"count (stacked dots)\")",
                );
                break;
            }
            case "ridgeline": {
                body.push(
                    ...readY("ridgeline"),
                    "import numpy as np",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    "for k, col_i in enumerate(yIndices):",
                    "    ys = np.array(col(col_i))",
                    "    ys = (ys - ys.mean()) / (ys.std() or 1.0)",
                    "    grid = np.linspace(-3.5, 3.5, 120)",
                    "    dens = np.exp(-0.5 * grid ** 2 * 2) * 0 + np.interp(grid, np.sort(ys), np.linspace(0.05, 1, len(ys)))",
                    "    dens = dens / dens.max()",
                    "    ax.fill_between(grid, k + 0.05, k + 0.9 * dens, alpha=0.55, label=headers[col_i])",
                    "ax.set_yticks(range(len(yIndices)), [headers[i] for i in yIndices])",
                );
                break;
            }
            case "connected": {
                body.push(
                    "pts = [(float(r[xIndex]), float(r[yIndices[0]])) for r in rows[1:]",
                    "        if len(r) > max(xIndex, yIndices[0])",
                    "        and r[xIndex].strip().lstrip(\"-\").replace(\".\", \"\", 1).replace(\"-\", \"\").isdigit()",
                    "        and r[yIndices[0]].strip().lstrip(\"-\").replace(\".\", \"\", 1).replace(\"-\", \"\").isdigit()]",
                    "xs = [p[0] for p in pts]",
                    "ys = [p[1] for p in pts]",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    "ax.plot(xs, ys, \"-o\", markersize=3, alpha=0.8)",
                    `ax.set_xlabel(${JSON.stringify(xName)})`,
                    `ax.set_ylabel(${JSON.stringify(yNames[0] ?? "y")})`,
                );
                break;
            }
            case "scatter-matrix": {
                body.push(
                    "import numpy as np",
                    "cols = []",
                    "for col_i in yIndices:",
                    "    try:",
                    "        cols.append(np.array([float(r[col_i]) for r in rows[1:] if len(r) > col_i and r[col_i].strip()]))",
                    "    except ValueError:",
                    "        pass",
                    "n = len(cols)",
                    "fig, axes = plt.subplots(n, n, figsize=(3 * n, 3 * n), squeeze=False)",
                    "for i in range(n):",
                    "    for j in range(n):",
                    "        if i == j:",
                    "            axes[i][j].hist(cols[i], bins=15)",
                    "        else:",
                    "            axes[i][j].scatter(cols[j], cols[i], s=6, alpha=0.6)",
                    "        if i == n - 1: axes[i][j].set_xlabel(headers[yIndices[j]])",
                    "        if j == 0: axes[i][j].set_ylabel(headers[yIndices[i]])",
                );
                break;
            }
            case "waffle": {
                body.push(
                    "from collections import defaultdict",
                    "agg = defaultdict(float)",
                    "for r in rows[1:]:",
                    "    try:",
                    "        agg[r[xIndex]] += float(r[yIndices[0]])",
                    "    except (ValueError, IndexError):",
                    "        pass",
                    "items = sorted(agg.items(), key=lambda kv: -kv[1])[:5]",
                    "total = sum(v for _, v in items) or 1.0",
                    "fig, ax = plt.subplots(figsize=(5, 5))",
                    "filled = 0",
                    "for k, (label, v) in enumerate(items):",
                    "    squares = round(v / total * 100)",
                    "    for s in range(squares):",
                    "        i = filled + s",
                    "        ax.add_patch(plt.Rectangle((i % 10, 9 - i // 10), 0.9, 0.9, color=plt.cm.tab20(k)))",
                    "    filled += squares",
                    "ax.set_xlim(0, 10)",
                    "ax.set_ylim(0, 10)",
                    "ax.set_aspect(\"equal\")",
                    "ax.legend([plt.Rectangle((0, 0), 1, 1, color=plt.cm.tab20(k)) for k in range(len(items))], [k for k, _ in items], loc=\"center left\", bbox_to_anchor=(1, 0.5))",
                );
                break;
            }
            case "rose": {
                body.push(
                    "import numpy as np",
                    "from collections import defaultdict",
                    "agg = defaultdict(float)",
                    "for r in rows[1:]:",
                    "    try:",
                    "        agg[r[xIndex]] += float(r[yIndices[0]])",
                    "    except (ValueError, IndexError):",
                    "        pass",
                    "items = sorted(agg.items(), key=lambda kv: kv[0])[:14]",
                    "vals = [v for _, v in items]",
                    "fig = plt.figure(figsize=(6, 6))",
                    "ax = fig.add_subplot(polar=True)",
                    "theta = np.linspace(0, 2 * np.pi, len(vals), endpoint=False)",
                    "ax.bar(theta, vals, width=2 * np.pi / max(1, len(vals)), alpha=0.8)",
                    "ax.set_xticks(theta)",
                    "ax.set_xticklabels([k for k, _ in items])",
                );
                break;
            }
            case "lollipop": {
                body.push(
                    ...readY("lollipop"),
                    "ys = col(yIndices[0])[:24]",
                    "fig, ax = plt.subplots(figsize=(8, max(3, 0.35 * len(ys))))",
                    "ax.hlines(range(len(ys)), 0, ys, color=\"#71717a\", linewidth=1)",
                    "ax.plot(ys, range(len(ys)), \"o\", color=\"#10b981\", markersize=5)",
                    "ax.set_yticks(range(len(ys)), [r[xIndex] for r in rows[1:len(ys) + 1]])",
                    "ax.margins(y=0.02)",
                );
                break;
            }
            case "slope": {
                body.push(
                    ...readY("slope"),
                    "fig, ax = plt.subplots(figsize=(4.5, 4.5))",
                    "for col_i in yIndices:",
                    "    ys = col(col_i)",
                    "    if len(ys) >= 2:",
                    "        ax.plot([0, 1], [ys[0], ys[-1]], \"-o\", markersize=5, label=f\"{headers[col_i]}: {ys[0]:g} → {ys[-1]:g}\")",
                    "        ax.annotate(f\"{ys[0]:g}\", (0, ys[0]), textcoords=\"offset points\", xytext=(-6, 0), ha=\"right\")",
                    "        ax.annotate(f\"{ys[-1]:g}\", (1, ys[-1]), textcoords=\"offset points\", xytext=(6, 0), ha=\"left\")",
                    "ax.set_xticks([0, 1], [\"first\", \"last\"])",
                    "for spine in (\"top\", \"right\"):",
                    "    ax.spines[spine].set_visible(False)",
                    legendShow,
                );
                break;
            }
            case "bullet": {
                body.push(
                    ...readY("bullet"),
                    "import statistics",
                    "ys = col(yIndices[0])[:14]",
                    "mu = statistics.mean(col(yIndices[0]))",
                    "fig, ax = plt.subplots(figsize=(8, max(2.5, 0.5 * len(ys))))",
                    "ax.barh(range(len(ys)), ys, height=0.55, color=\"#a7f3d0\")",
                    "ax.axvline(mu, color=\"#d97706\", linewidth=1.6)",
                    "ax.set_yticks(range(len(ys)), [r[xIndex] for r in rows[1:len(ys) + 1]])",
                    'ax.set_xlabel("value · amber line = column mean")',
                );
                break;
            }
            case "parallel": {
                body.push(
                    "import numpy as np",
                    "cols = []",
                    "for col_i in yIndices:",
                    "    try:",
                    "        vals = np.array([float(r[col_i]) for r in rows[1:] if len(r) > col_i and r[col_i].strip()])",
                    "        cols.append((vals - vals.min()) / ((vals.max() - vals.min()) or 1.0))",
                    "    except ValueError:",
                    "        pass",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    "for row_i in range(min(40, len(cols[0]) if cols else 0)):",
                    "    ax.plot(range(len(cols)), [c[row_i] for c in cols], alpha=0.5, linewidth=1)",
                    "ax.set_xticks(range(len(yIndices)), [headers[i] for i in yIndices])",
                    "ax.set_ylabel(\"min-max normalized\")",
                );
                break;
            }
            case "qq": {
                body.push(
                    ...readY("qq"),
                    "from statistics import NormalDist",
                    "import numpy as np",
                    "ys = np.sort(np.array(col(yIndices[0])))",
                    "n = len(ys)",
                    "probs = (np.arange(1, n + 1) - 0.5) / n",
                    "mu, sd = float(ys.mean()), float(ys.std())",
                    "theo = np.array([NormalDist().inv_cdf(p) * sd + mu for p in probs])",
                    "fig, ax = plt.subplots(figsize=(5.5, 5.5))",
                    "ax.scatter(theo, ys, s=12, alpha=0.8)",
                    "lo, hi = min(theo[0], ys[0]), max(theo[-1], ys[-1])",
                    "ax.plot([lo, hi], [lo, hi], color=\"#d97706\")",
                    "ax.set_xlabel(\"theoretical quantiles\")",
                    "ax.set_ylabel(\"sample quantiles\")",
                );
                break;
            }
            case "cumsum": {
                body.push(
                    ...readY("cumsum"),
                    "import itertools",
                    "ys = list(itertools.accumulate(col(yIndices[0])))",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    "ax.plot(range(len(ys)), ys, marker=\"o\", markersize=3)",
                    ...tickBlock("xs"),
                );
                break;
            }
            case "rolling": {
                body.push(
                    ...readY("rolling"),
                    "import statistics",
                    "window = 7",
                    "fig, ax = plt.subplots(figsize=(8, 4))",
                    "for col_i in yIndices:",
                    "    ys = col(col_i)",
                    "    mean = [statistics.mean(ys[max(0, i - window + 1): i + 1]) for i in range(len(ys))]",
                    "    ax.plot(range(len(mean)), mean, label=f\"{headers[col_i]} (7-row mean)\")",
                    legendShow,
                );
                break;
            }
        }
        const script = [...head, ...body, "ax.grid(alpha=0.3)", "plt.tight_layout()", "plt.show()"].join("\n");
        void navigator.clipboard
            .writeText(script)
            .then(() => toast({title: "Matplotlib script copied", variant: "success"}));
    };

    const currentSpec = specOf(kind);
    const CurrentIcon = currentSpec.icon;
    const hasData =
        // axis-less proportion charts need the category aggregation;
        // distribution/statistics charts need numeric series; everything
        // else needs seriesList with numeric Y values.
        ["pie", "donut", "treemap", "bar-100", "waffle", "rose"].includes(kind)
            ? categoryAgg.length > 0
            : ["histogram", "box", "violin", "beeswarm", "ecdf", "heatmap",
                "dotplot", "ridgeline", "scatter-matrix", "parallel", "qq"].includes(kind)
                ? numericSeries.length > 0
                : bounds !== null && seriesList.length > 0;

    const statusLine = React.useMemo(() => {
        if (!parsed) return "";
        if (["pie", "donut", "treemap"].includes(kind)) {
            return categoryAgg.length
                ? `${categoryAgg.length} categories · total ${fmt(categoryAgg.reduce((s, c) => s + c.value, 0))}`
                : "";
        }
        if (["bar-100", "waffle"].includes(kind)) return seriesList.length ? `${seriesList.length} series` : "";
        if (kind === "rose") return categoryAgg.length ? `${categoryAgg.length} wedges · total ${fmt(categoryAgg.reduce((s, c) => s + c.value, 0))}` : "";
        if (kind === "slope") return seriesList.length ? `${seriesList.length} series · first → last` : "";
        if (kind === "bullet") return seriesList.length ? `${Math.min(seriesList[0].points.length, 14)} rows vs the column mean` : "";
        if (kind === "qq") return numericSeries.length ? `${numericSeries[0].values.length} points vs the normal quantiles` : "";
        if (kind === "cumsum") return bounds ? `running total over ${bounds.n} rows → ${fmt(seriesList[0].points.reduce((s, pp) => s + (pp.y as number), 0))}` : "";
        if (kind === "rolling") return bounds ? `7-row mean of ${bounds.n} points` : "";
        if (kind === "band") return bounds ? `trend ±1σ of ${bounds.n} points` : "";
        if (["histogram", "box", "violin", "beeswarm", "ecdf", "dotplot", "ridgeline", "parallel", "scatter-matrix"].includes(kind)) {
            return numericSeries.length ? `${numericSeries.length} column${numericSeries.length === 1 ? "" : "s"} · ${numericSeries.reduce((n, s) => n + s.values.length, 0)} values` : "";
        }
        if (kind === "heatmap") return bounds ? `${bounds.n} points binned 12×8` : "";
        return bounds ? `${bounds.n} points · Y range ${fmt(bounds.yMin)} … ${fmt(bounds.yMax)}` : "";
    }, [kind, bounds, categoryAgg, numericSeries, seriesList, parsed]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <ResizableDialogContent id="chart-preview" defaultW={1280} defaultH={820}
                                    className="flex flex-col overflow-hidden">
                <DialogHeader className="shrink-0 pb-2.5">
                    <DialogTitle className="flex items-center gap-2">
                        <BarChart3 className="size-4 text-emerald-500"/>
                        Chart Preview — {fileName}
                    </DialogTitle>
                    <DialogDescription>
                        Instant client-side chart from the table&apos;s columns — 39 figure types in eight
                        categories; the notes above the graph explain when to use each one, and the
                        matplotlib snippet reproduces it in a script.
                    </DialogDescription>
                </DialogHeader>

                {error &&
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-md p-2">{error}</p>}
                {!text && !error && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
                        <Loader2 className="size-3.5 animate-spin"/> Reading {fileName}…
                    </div>
                )}

                {parsed && (
                    <div className="space-y-3 flex flex-col flex-1 min-h-0">
                        <div className="flex flex-wrap items-center gap-3 text-xs shrink-0">
                            <div className="flex items-center gap-1.5">
                                <Label className="text-xs">X</Label>
                                <select
                                    value={xCol}
                                    onChange={(e) => setXCol(Number(e.target.value))}
                                    className="h-7 rounded-md border bg-background px-1.5 max-w-36"
                                >
                                    {parsed.headers.map((h, i) => (
                                        <option key={i} value={i}>{h || `col ${i}`}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Label className="text-xs">Y</Label>
                                {parsed.headers.map((h, i) => {
                                    const numericish =
                                        parsed.rows.slice(0, 50).filter((r) => toNumber(r[i] ?? "") !== null).length >=
                                        Math.min(25, parsed.rows.length) * 0.8;
                                    if (!numericish && !yCols.includes(i)) return null;
                                    return (
                                        <button
                                            key={i}
                                            type="button"
                                            className={`rounded-md border px-1.5 h-7 text-[11px] truncate max-w-28 ${yCols.includes(i) ? "bg-emerald-500/15 border-emerald-500/50" : "opacity-60"}`}
                                            title={h}
                                            onClick={() =>
                                                setYCols((prev) => (prev.includes(i) ? prev.filter((c) => c !== i) : [...prev, i].slice(0, 4)))
                                            }
                                        >
                                            {h || `col ${i}`}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* ── the figure-type menu: categories ▸ chart types ── */}
                            <div className="flex items-center gap-1 ml-auto">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px] px-2"
                                                title="Pick a figure category, then a chart type">
                                            <CurrentIcon className="size-3.5 text-emerald-500"/>
                                            {currentSpec.category} ▸ {currentSpec.label}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-64">
                                        <DropdownMenuLabel
                                            className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                            Figure categories
                                        </DropdownMenuLabel>
                                        {CATEGORIES.map((cat, ci) => {
                                            const CatIcon = cat.icon;
                                            const types = CHART_TYPES.filter((t) => t.category === cat.id);
                                            return (
                                                <React.Fragment key={cat.id}>
                                                    <DropdownMenuSub>
                                                        <DropdownMenuSubTrigger className="gap-2 cursor-pointer"
                                                                                title={cat.blurb}>
                                                            <CatIcon className="size-3.5 text-emerald-500"/>
                                                            <span className="flex-1">{cat.label}</span>
                                                            <span
                                                                className="text-[9px] text-muted-foreground">{types.length}</span>
                                                        </DropdownMenuSubTrigger>
                                                        <DropdownMenuSubContent className="w-60">
                                                            {types.map((t) => {
                                                                const TIcon = t.icon;
                                                                return (
                                                                    <DropdownMenuItem
                                                                        key={t.id}
                                                                        className="gap-2 cursor-pointer"
                                                                        title={t.hint}
                                                                        onClick={() => setKind(t.id)}
                                                                    >
                                                                        <TIcon
                                                                            className={`size-3.5 ${kind === t.id ? "text-emerald-500" : "text-muted-foreground"}`}/>
                                                                        <span className="flex-1">{t.label}</span>
                                                                        {kind === t.id && <span
                                                                          className="text-[9px] text-emerald-500">current</span>}
                                                                    </DropdownMenuItem>
                                                                );
                                                            })}
                                                        </DropdownMenuSubContent>
                                                    </DropdownMenuSub>
                                                    {ci < CATEGORIES.length - 1 &&
                                                      <DropdownMenuSeparator className="my-0.5"/>}
                                                </React.Fragment>
                                            );
                                        })}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        {/* ── Figure notes — the benefit + usage guidance for the
                SELECTED figure, shown BEFORE the graph area so the
                reader learns when to use it, then sees it. */}
                        <div className="rounded-md border bg-muted/30 px-3 py-2 flex items-start gap-2 shrink-0">
                            <Info className="size-3.5 mt-0.5 shrink-0 text-emerald-500"/>
                            <div className="text-[11px] leading-relaxed text-muted-foreground">
                                <span className="font-semibold text-foreground">{currentSpec.label}</span>
                                {" — "}
                                {currentSpec.benefit}
                                <br/>
                                <span
                                    className="font-semibold text-foreground">How to use it:</span> {currentSpec.usage}
                            </div>
                        </div>

                        {hasData ? (
                            <div className="rounded-md border bg-card p-2 flex-1 min-h-0 overflow-hidden">
                                <SvgChart
                                    kind={kind}
                                    series={seriesList}
                                    numericSeries={numericSeries}
                                    categoryAgg={categoryAgg}
                                    bounds={bounds}
                                    svgRef={chartSvgRef}
                                />
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                No usable data for a {currentSpec.label.toLowerCase()} — pick a numeric column
                                {["pie", "donut", "treemap", "bar-100", "waffle", "rose", "radar", "lollipop", "bullet", "diverging"].includes(kind) ? " and a category X column." : "."}
                            </p>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                            <p className="text-[11px] text-muted-foreground">{statusLine}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                                        onClick={copyChartImage}
                                        title="Copy the chart itself as a PNG image to the clipboard">
                                    <Copy className="size-3"/> Copy image
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                                        onClick={saveChartToFile}
                                        title="Save the chart as a PNG into the project (Charts/…)">
                                    <FolderInput className="size-3"/> Save PNG
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                                        onClick={downloadPng} title="Download the chart as a PNG file">
                                    <Download className="size-3"/> PNG
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                                        onClick={downloadSvg} title="Download the chart as a vector SVG file">
                                    <Download className="size-3"/> SVG
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={copyScript}
                                        title="Copy a matplotlib snippet that reproduces this chart">
                                    <Copy className="size-3"/> matplotlib script
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </ResizableDialogContent>
        </Dialog>
    );
}

/* ──────────────────────────────────────────────────────────── */
/*  The SVG renderers — one shared canvas, one switch of bodies  */

/* ──────────────────────────────────────────────────────────── */

interface Series {
    col: number;
    header: string;
    points: Array<{ x: number; y: number | null; label: string }>;
}

interface NumericSeries {
    col: number;
    header: string;
    values: number[];
}

interface CatAgg {
    label: string;
    value: number;
}

interface Bounds {
    yMin: number;
    yMax: number;
    n: number;
}

function SvgChart({
                      kind,
                      series,
                      numericSeries,
                      categoryAgg,
                      bounds,
                      svgRef,
                  }: {
    kind: ChartTypeId;
    series: Series[];
    numericSeries: NumericSeries[];
    categoryAgg: CatAgg[];
    bounds: Bounds | null;
    svgRef?: React.RefObject<SVGSVGElement | null>;
}) {
    const W = 560;
    const H = 300;
    const pad = {l: 46, r: 14, t: 14, b: 34};
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;

    /* axis-space helpers (used by every cartesian chart) */
    const yMin = bounds?.yMin ?? 0;
    const rawYMax = bounds?.yMax ?? 1;
    const yMax = rawYMax === yMin ? yMin + 1 : rawYMax;
    const yScale = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * ih;
    const n = Math.max(...series.map((s) => s.points.length), 1);
    const xScale = (i: number) => pad.l + (n === 1 ? 0.5 : i / (n - 1)) * iw;

    const ticks = 4;
    const yTicks = Array.from({length: ticks + 1}, (_, i) => yMin + ((yMax - yMin) * i) / ticks);
    const xStep = Math.max(1, Math.ceil(n / 8));

    const yAxis = (
        <>
            {yTicks.map((t, i) => (
                <g key={i}>
                    <line x1={pad.l} x2={W - pad.r} y1={yScale(t)} y2={yScale(t)} stroke="currentColor"
                          strokeOpacity={0.12}/>
                    <text x={pad.l - 6} y={yScale(t) + 3} textAnchor="end"
                          className="fill-current text-[9px] opacity-60">
                        {fmt(t)}
                    </text>
                </g>
            ))}
            {series[0]?.points.map((p, i) =>
                i % xStep === 0 ? (
                    <text key={i} x={xScale(i)} y={H - pad.b + 12} textAnchor="middle"
                          className="fill-current text-[8px] opacity-60">
                        {(p.label || String(p.x)).slice(0, 8)}
                    </text>
                ) : null
            )}
        </>
    );

    const legend = (
        <>
            {series.map((s, si) => (
                <g key={s.col} transform={`translate(${pad.l + si * 130}, ${H - 8})`}>
                    <rect width={10} height={3} y={-1.5} fill={SERIES_COLORS[si % SERIES_COLORS.length]} rx={1.5}/>
                    <text x={14} y={2} className="fill-current text-[9px]">{s.header.slice(0, 18)}</text>
                </g>
            ))}
        </>
    );

    /* ── Trends ───────────────────────────────────────────── */
    const renderTrends = () => {
        if (kind === "band") {
            // Rolling mean ± 1σ band (window 7) of the first series.
            const vals = series[0].points.map((p) => p.y as number);
            const window = 7;
            const stat = (i: number) => {
                const from = Math.max(0, i - window + 1);
                const slice = vals.slice(from, i + 1);
                const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
                const varr = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
                return {mean, sd: Math.sqrt(varr)};
            };
            const stats = vals.map((_, i) => stat(i));
            const all = stats.flatMap((s) => [s.mean + s.sd, s.mean - s.sd]);
            const lo = Math.min(...all);
            const hi = Math.max(...all);
            const sy = (v: number) => pad.t + (1 - (v - lo) / ((hi - lo) || 1)) * ih;
            const mid = stats.map((s, i) => ({x: xScale(i), y: sy(s.mean)}));
            const up = stats.map((s, i) => ({x: xScale(i), y: sy(s.mean + s.sd)}));
            const dn = stats.map((s, i) => ({x: xScale(i), y: sy(s.mean - s.sd)}));
            return (
                <>
                    {yTicks.map((_, i) => (
                        <line key={i} x1={pad.l} x2={W - pad.r} y1={pad.t + (ih * i) / ticks}
                              y2={pad.t + (ih * i) / ticks} stroke="currentColor" strokeOpacity={0.12}/>
                    ))}
                    <path
                        d={`M${up.map((p) => `${p.x},${p.y}`).join(" L")} L${dn.map((p) => `${p.x},${p.y}`).reverse().join(" L")} Z`}
                        fill={SERIES_COLORS[0]}
                        fillOpacity={0.18}
                    />
                    <polyline points={mid.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={SERIES_COLORS[0]}
                              strokeWidth={2}/>
                    {series[0].points.map((p, i) =>
                        i % xStep === 0 ? (
                            <text key={i} x={xScale(i)} y={H - pad.b + 12} textAnchor="middle"
                                  className="fill-current text-[8px] opacity-60">{(p.label || String(p.x)).slice(0, 8)}</text>
                        ) : null
                    )}
                    <text x={pad.l - 6} y={pad.t + 8} textAnchor="end"
                          className="fill-current text-[8px] opacity-60">{fmt(hi)}</text>
                    <text x={pad.l - 6} y={pad.t + ih} textAnchor="end"
                          className="fill-current text-[8px] opacity-60">{fmt(lo)}</text>
                    {legend}
                </>
            );
        }
        if (kind === "area-stacked") {
            const cols = series.map((s) => s.points.map((p) => p.y as number));
            const rowsCount = Math.max(...cols.map((c) => c.length), 0);
            const stacks: number[][] = [];
            let running = new Array(rowsCount).fill(0);
            for (const c of cols) {
                const next = running.map((v, i) => v + (c[i] ?? 0));
                stacks.push(next);
                running = next;
            }
            const top = Math.max(...stacks[stacks.length - 1], 1);
            const sy = (v: number) => pad.t + (1 - v / top) * ih;
            return (
                <>
                    {yTicks.map((_, i) => (
                        <line key={i} x1={pad.l} x2={W - pad.r} y1={pad.t + (ih * i) / ticks}
                              y2={pad.t + (ih * i) / ticks} stroke="currentColor" strokeOpacity={0.12}/>
                    ))}
                    {[yMax0(top), top / 2, 0].map((t, i) => (
                        <text key={i} x={pad.l - 6} y={sy(t) + 3} textAnchor="end"
                              className="fill-current text-[9px] opacity-60">{fmt(t)}</text>
                    ))}
                    {series.map((s, si) => {
                        const stacked = stacks[si];
                        const below = si === 0 ? new Array(stacked.length).fill(0) : stacks[si - 1];
                        const pts = stacked.map((v, i) => ({x: xScale(i), y: sy(v)}));
                        const base = below.map((v, i) => ({x: xScale(i), y: sy(v)}));
                        const d = `M${pts.map((p) => `${p.x},${p.y}`).join(" L")} L${base.map((p) => `${p.x},${p.y}`).reverse().join(" L")} Z`;
                        return <path key={s.col} d={d} fill={SERIES_COLORS[si % SERIES_COLORS.length]}
                                     fillOpacity={0.75} stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
                                     strokeWidth={1.2}/>;
                    })}
                    {series[0]?.points.map((p, i) =>
                        i % xStep === 0 ? (
                            <text key={i} x={xScale(i)} y={H - pad.b + 12} textAnchor="middle"
                                  className="fill-current text-[8px] opacity-60">
                                {(p.label || String(p.x)).slice(0, 8)}
                            </text>
                        ) : null
                    )}
                    {legend}
                </>
            );
        }
        return (
            <>
                {yAxis}
                {series.map((s, si) => {
                    const color = SERIES_COLORS[si % SERIES_COLORS.length];
                    const pts = s.points.map((p, i) => ({x: xScale(i), y: yScale(p.y as number)}));
                    if (kind === "area") {
                        const d = `M${pad.l},${pad.t + ih} L${pts.map((p) => `${p.x},${p.y}`).join(" L")} L${W - pad.r},${pad.t + ih} Z`;
                        return (
                            <g key={s.col}>
                                <path d={d} fill={color} fillOpacity={0.22}/>
                                <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color}
                                          strokeWidth={1.8}/>
                            </g>
                        );
                    }
                    if (kind === "spline") {
                        return <path key={s.col} d={splinePath(pts)} fill="none" stroke={color} strokeWidth={1.8}/>;
                    }
                    if (kind === "step") {
                        const stepPts: string[] = [];
                        pts.forEach((p, i) => {
                            if (i === 0) stepPts.push(`${p.x},${p.y}`);
                            else stepPts.push(`${p.x},${pts[i - 1].y}`, `${p.x},${p.y}`);
                        });
                        return <polyline key={s.col} points={stepPts.join(" ")} fill="none" stroke={color}
                                         strokeWidth={1.8}/>;
                    }
                    return <polyline key={s.col} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none"
                                     stroke={color} strokeWidth={1.8}/>;
                })}
                {legend}
            </>
        );
    };

    /* ── Bars ─────────────────────────────────────────────── */
    const renderBars = () => {
        if (kind === "diverging") {
            // Deviation from the column mean — green right, red left.
            const s = series[0];
            const vals = s.points.map((p) => p.y as number);
            const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
            const devs = vals.map((v) => v - mean);
            const shown = Math.min(devs.length, 20);
            const rh = ih / Math.max(1, shown);
            const maxDev = Math.max(...devs.map(Math.abs), 1e-9);
            const zero = pad.l + iw / 2;
            const bw = (iw / 2 - 8) / maxDev;
            return (
                <>
                    <line x1={zero} x2={zero} y1={pad.t} y2={pad.t + ih} stroke="currentColor" strokeOpacity={0.35}/>
                    {devs.slice(0, shown).map((d, i) => (
                        <g key={i}>
                            <rect
                                x={d >= 0 ? zero : zero + d * bw}
                                y={pad.t + i * rh + rh * 0.15}
                                width={Math.max(1, Math.abs(d) * bw)}
                                height={rh * 0.7}
                                fill={d >= 0 ? "#10b981" : "#ef4444"}
                                fillOpacity={0.8}
                                rx={1.5}
                            />
                            <text x={zero - 6} y={pad.t + i * rh + rh / 2 + 3} textAnchor="end"
                                  className="fill-current text-[8px] opacity-60">{(s.points[i].label || String(s.points[i].x)).slice(0, 10)}</text>
                        </g>
                    ))}
                    <text x={zero} y={H - 8} textAnchor="middle"
                          className="fill-current text-[8px] opacity-60">mean {fmt(mean)}</text>
                    <text x={pad.l + iw - 2} y={pad.t - 3} textAnchor="end" className="fill-current text-[8px]"
                          fill="#10b981">above +
                    </text>
                    <text x={pad.l + 2} y={pad.t - 3} className="fill-current text-[8px]" fill="#ef4444">− below</text>
                </>
            );
        }
        if (kind === "bar-h") {
            const s = series[0];
            const vals = s.points.map((p) => p.y as number);
            const max = Math.max(...vals, 1);
            const rowsShown = Math.min(vals.length, 24);
            const rh = ih / rowsShown;
            const labels = s.points.slice(0, rowsShown).map((p) => p.label || String(p.x));
            return (
                <>
                    {vals.slice(0, rowsShown).map((v, i) => (
                        <g key={i}>
                            <rect x={pad.l} y={pad.t + i * rh + rh * 0.12} width={((v / max) * (iw - 8)) || 1}
                                  height={rh * 0.76} fill={SERIES_COLORS[0]} opacity={0.85} rx={2}/>
                            <text x={pad.l - 6} y={pad.t + i * rh + rh / 2 + 3} textAnchor="end"
                                  className="fill-current text-[8px] opacity-60">
                                {(labels[i] ?? "").slice(0, 10)}
                            </text>
                        </g>
                    ))}
                    {[max, max / 2, 0].map((t, i) => (
                        <text key={i} x={pad.l + (t / max) * (iw - 8)} y={pad.t + ih + 12} textAnchor="middle"
                              className="fill-current text-[8px] opacity-60">{fmt(t)}</text>
                    ))}
                </>
            );
        }
        if (kind === "bar-grouped" || kind === "bar-stacked") {
            const rowsCount = Math.max(...series.map((s) => s.points.length), 1);
            const shown = Math.min(rowsCount, 40);
            const slot = iw / shown;
            if (kind === "bar-grouped") {
                const bw = Math.max(1.5, (slot * 0.82) / series.length - 1);
                return (
                    <>
                        {yAxis}
                        {series.map((s, si) =>
                            s.points.slice(0, shown).map((p, i) => (
                                <rect
                                    key={`${s.col}-${i}`}
                                    x={pad.l + i * slot + slot * 0.09 + si * bw}
                                    y={yScale(p.y as number)}
                                    width={bw}
                                    height={Math.max(1, pad.t + ih - yScale(p.y as number))}
                                    fill={SERIES_COLORS[si % SERIES_COLORS.length]}
                                    opacity={0.85}
                                />
                            ))
                        )}
                        {series[0]?.points.slice(0, shown).map((p, i) =>
                            i % Math.max(1, Math.ceil(shown / 10)) === 0 ? (
                                <text key={i} x={pad.l + i * slot + slot / 2} y={H - pad.b + 12} textAnchor="middle"
                                      className="fill-current text-[8px] opacity-60">
                                    {(p.label || String(p.x)).slice(0, 8)}
                                </text>
                            ) : null
                        )}
                        {legend}
                    </>
                );
            }
            // stacked
            const running = new Array(shown).fill(0);
            return (
                <>
                    {yAxis}
                    {series.map((s, si) => {
                        const tops = s.points.slice(0, shown).map((p, i) => running[i] + (p.y as number));
                        const blocks = tops.map((t, i) => (
                            <rect
                                key={i}
                                x={pad.l + i * slot + slot * 0.09}
                                y={yScale(t)}
                                width={Math.max(1.5, slot * 0.82)}
                                height={Math.max(0.5, yScale(running[i]) - yScale(t))}
                                fill={SERIES_COLORS[si % SERIES_COLORS.length]}
                                opacity={0.85}
                            />
                        ));
                        s.points.slice(0, shown).forEach((_, i) => {
                            running[i] = tops[i];
                        });
                        return <g key={s.col}>{blocks}</g>;
                    })}
                    {series[0]?.points.slice(0, shown).map((p, i) =>
                        i % Math.max(1, Math.ceil(shown / 10)) === 0 ? (
                            <text key={i} x={pad.l + i * slot + slot / 2} y={H - pad.b + 12} textAnchor="middle"
                                  className="fill-current text-[8px] opacity-60">
                                {(p.label || String(p.x)).slice(0, 8)}
                            </text>
                        ) : null
                    )}
                    {legend}
                </>
            );
        }
        if (kind === "pareto") {
            const vals = [...(series[0]?.points.map((p) => ({label: p.label || String(p.x), v: p.y as number})) ?? [])]
                .sort((a, b) => b.v - a.v)
                .slice(0, 20);
            const total = vals.reduce((s, x) => s + x.v, 0) || 1;
            const max = Math.max(...vals.map((x) => x.v), 1);
            const bw = iw / vals.length;
            let cum = 0;
            const cumPts = vals.map((x, i) => {
                cum += x.v;
                return {x: pad.l + i * bw + bw / 2, y: pad.t + (1 - cum / total) * ih};
            });
            return (
                <>
                    {[max, max / 2, 0].map((t, i) => (
                        <g key={i}>
                            <line x1={pad.l} x2={W - pad.r} y1={yScalePar(t, max)} y2={yScalePar(t, max)}
                                  stroke="currentColor" strokeOpacity={0.12}/>
                            <text x={pad.l - 6} y={yScalePar(t, max) + 3} textAnchor="end"
                                  className="fill-current text-[9px] opacity-60">{fmt(t)}</text>
                        </g>
                    ))}
                    {vals.map((x, i) => (
                        <rect key={i} x={pad.l + i * bw + bw * 0.12} y={yScalePar(x.v, max)}
                              width={Math.max(1.5, bw * 0.76)} height={pad.t + ih - yScalePar(x.v, max)}
                              fill={SERIES_COLORS[0]} opacity={0.85}/>
                    ))}
                    <polyline points={cumPts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#f59e0b"
                              strokeWidth={1.6}/>
                    {vals.map((x, i) =>
                        i % Math.max(1, Math.ceil(vals.length / 10)) === 0 ? (
                            <text key={i} x={pad.l + i * bw + bw / 2} y={H - pad.b + 12} textAnchor="middle"
                                  className="fill-current text-[8px] opacity-60">
                                {x.label.slice(0, 8)}
                            </text>
                        ) : null
                    )}
                    <g transform={`translate(${pad.l}, ${H - 8})`}>
                        <rect width={10} height={3} y={-1.5} fill={SERIES_COLORS[0]} rx={1.5}/>
                        <text x={14} y={2} className="fill-current text-[9px]">bars (sorted)</text>
                        <rect x={90} width={10} height={3} y={-1.5} fill="#f59e0b" rx={1.5}/>
                        <text x={104} y={2} className="fill-current text-[9px]">cumulative</text>
                    </g>
                </>
            );
        }
        // plain vertical bars (first series)
        const s0 = series[0];
        const vals = s0.points.map((p) => p.y as number);
        const bw = Math.max(2, iw / Math.max(vals.length, 1) - 1);
        return (
            <>
                {yAxis}
                {vals.map((v, i) => (
                    <rect key={i} x={xScale(i) - bw / 2} y={yScale(v)} width={bw}
                          height={Math.max(1, pad.t + ih - yScale(v))} fill={SERIES_COLORS[0]} opacity={0.85}/>
                ))}
            </>
        );
    };

    const yScalePar = (v: number, max: number) => pad.t + (1 - v / max) * ih;
    const yMax0 = (v: number) => v;

    /* ── Distribution ─────────────────────────────────────── */
    const renderDistribution = () => {
        if (kind === "dotplot") {
            // Stacked dots — one dot per value, 18 bins across the range.
            const values = numericSeries[0]?.values ?? [];
            if (values.length === 0) return null;
            const lo = Math.min(...values);
            const hi = Math.max(...values);
            const NB = 18;
            const counts = new Array(NB).fill(0);
            for (const v of values) {
                const b = Math.min(NB - 1, Math.floor(((v - lo) / ((hi - lo) || 1)) * NB));
                counts[b]++;
            }
            const maxC = Math.max(...counts, 1);
            const bx = (b: number) => pad.l + (b / NB) * iw;
            const bwid = iw / NB - 2;
            const dy = Math.min(ih / (maxC + 2), 9);
            return (
                <>
                    {yTicks.map((_, i) => (
                        <line key={i} x1={pad.l} x2={W - pad.r} y1={pad.t + (ih * i) / ticks}
                              y2={pad.t + (ih * i) / ticks} stroke="currentColor" strokeOpacity={0.1}/>
                    ))}
                    {counts.map((c, b) =>
                        Array.from({length: c}, (_, k) => (
                            <circle key={`${b}-${k}`} cx={bx(b) + bwid / 2 + 1} cy={pad.t + ih - 4 - k * dy}
                                    r={Math.min(2.6, dy / 2)} fill={SERIES_COLORS[0]} fillOpacity={0.85}/>
                        ))
                    )}
                    <text x={W / 2} y={H - 6} textAnchor="middle"
                          className="fill-current text-[8px] opacity-60">{numericSeries[0].header.slice(0, 20)}</text>
                    <text x={pad.l - 6} y={pad.t + 8} textAnchor="end"
                          className="fill-current text-[8px] opacity-60">{maxC}</text>
                </>
            );
        }
        if (kind === "ridgeline") {
            // One half-density ridge per numeric column, stacked with overlap.
            const cols = numericSeries.slice(0, 4);
            if (cols.length === 0) return null;
            const rowsCount = cols.length;
            const rh = ih / rowsCount;
            const gridN = 60;
            return (
                <>
                    {cols.map((c, k) => {
                        const sortedVals = [...c.values].sort((a, b) => a - b);
                        const lo = sortedVals[0];
                        const hi = sortedVals[sortedVals.length - 1];
                        const xAt = (f: number) => pad.l + f * iw;
                        // Simple empirical density: interpolate the sorted-rank curve.
                        const dens = Array.from({length: gridN}, (_, g) => {
                            const v = lo + ((hi - lo) * g) / (gridN - 1);
                            // fraction of values within a small window
                            const win = ((hi - lo) || 1) * 0.06;
                            const n = c.values.filter((x) => Math.abs(x - v) <= win).length;
                            return n / Math.max(1, c.values.length) / win;
                        });
                        const dmax = Math.max(...dens, 1e-9);
                        const baseY = pad.t + k * rh + rh * 0.75;
                        const ridgeH = rh * 0.62;
                        const d = `M${xAt(0)},${baseY} ` +
                            dens.map((dv, g) => `L${xAt(g / (gridN - 1))},${baseY - (dv / dmax) * ridgeH}`).join(" ") +
                            ` L${xAt(1)},${baseY} Z`;
                        return (
                            <g key={c.col}>
                                <path d={d} fill={SERIES_COLORS[k % SERIES_COLORS.length]} fillOpacity={0.55}
                                      stroke={SERIES_COLORS[k % SERIES_COLORS.length]} strokeWidth={1.2}/>
                                <text x={pad.l - 6} y={baseY - 2} textAnchor="end"
                                      className="fill-current text-[8px] opacity-70">{c.header.slice(0, 12)}</text>
                            </g>
                        );
                    })}
                    <text x={W / 2} y={H - 6} textAnchor="middle" className="fill-current text-[8px] opacity-60">value
                        →
                    </text>
                </>
            );
        }
        if (kind === "histogram") {
            const values = numericSeries[0]?.values ?? [];
            const nbins = 20;
            const lo = Math.min(...values);
            const hi = Math.max(...values);
            const span = hi - lo || 1;
            const bins = new Array(nbins).fill(0);
            for (const v of values) bins[Math.min(nbins - 1, Math.floor(((v - lo) / span) * nbins))]++;
            const max = Math.max(...bins, 1);
            const bw = iw / nbins;
            return (
                <>
                    {[max, max / 2, 0].map((t, i) => (
                        <g key={i}>
                            <line x1={pad.l} x2={W - pad.r} y1={yScalePar(t, max)} y2={yScalePar(t, max)}
                                  stroke="currentColor" strokeOpacity={0.12}/>
                            <text x={pad.l - 6} y={yScalePar(t, max) + 3} textAnchor="end"
                                  className="fill-current text-[9px] opacity-60">{fmt(t)}</text>
                        </g>
                    ))}
                    {bins.map((c, i) => (
                        <rect key={i} x={pad.l + i * bw + 0.5} y={yScalePar(c, max)} width={Math.max(1, bw - 1)}
                              height={pad.t + ih - yScalePar(c, max)} fill={SERIES_COLORS[0]} opacity={0.85}/>
                    ))}
                    {[lo, (lo + hi) / 2, hi].map((t, i) => (
                        <text key={i} x={pad.l + (i / 2) * iw} y={H - pad.b + 12} textAnchor="middle"
                              className="fill-current text-[8px] opacity-60">{fmt(t)}</text>
                    ))}
                </>
            );
        }
        if (kind === "box" || kind === "violin" || kind === "beeswarm") {
            const k = numericSeries.length;
            const slot = iw / Math.max(k, 1);
            const all = numericSeries.flatMap((s) => s.values);
            const lo = Math.min(...all);
            const hi = Math.max(...all);
            const span = (hi - lo) || 1;
            const sy = (v: number) => pad.t + (1 - (v - lo) / span) * ih;
            return (
                <>
                    {[hi, hi - span * 0.25, hi - span * 0.5, hi - span * 0.75, lo].map((t, i) => (
                        <g key={i}>
                            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="currentColor"
                                  strokeOpacity={0.12}/>
                            <text x={pad.l - 6} y={sy(t) + 3} textAnchor="end"
                                  className="fill-current text-[9px] opacity-60">{fmt(t)}</text>
                        </g>
                    ))}
                    {numericSeries.map((s, si) => {
                        const cx = pad.l + si * slot + slot / 2;
                        const color = SERIES_COLORS[si % SERIES_COLORS.length];
                        if (kind === "box") {
                            const sorted = [...s.values].sort((a, b) => a - b);
                            const q1 = quantile(sorted, 0.25);
                            const q2 = quantile(sorted, 0.5);
                            const q3 = quantile(sorted, 0.75);
                            const iqr = q3 - q1 || 1;
                            const wLo = Math.max(lo, q1 - 1.5 * iqr);
                            const wHi = Math.min(hi, q3 + 1.5 * iqr);
                            const outliers = sorted.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr);
                            const bw = Math.min(slot * 0.5, 54);
                            return (
                                <g key={s.col} stroke={color} fill="none" strokeWidth={1.4}>
                                    <line x1={cx} x2={cx} y1={sy(wLo)} y2={sy(wHi)}/>
                                    <line x1={cx - 8} x2={cx + 8} y1={sy(wLo)} y2={sy(wLo)}/>
                                    <line x1={cx - 8} x2={cx + 8} y1={sy(wHi)} y2={sy(wHi)}/>
                                    <rect x={cx - bw / 2} y={sy(q3)} width={bw} height={Math.max(1, sy(q1) - sy(q3))}
                                          fill={color} fillOpacity={0.18}/>
                                    <line x1={cx - bw / 2} x2={cx + bw / 2} y1={sy(q2)} y2={sy(q2)} strokeWidth={2}/>
                                    {outliers.map((v, oi) => (
                                        <circle key={oi} cx={cx} cy={sy(v)} r={1.8} fill={color} fillOpacity={0.7}
                                                strokeWidth={0}/>
                                    ))}
                                </g>
                            );
                        }
                        if (kind === "violin") {
                            const nb = 24;
                            const bins = new Array(nb).fill(0);
                            for (const v of s.values) bins[Math.min(nb - 1, Math.floor(((v - lo) / span) * nb))]++;
                            const maxC = Math.max(...bins, 1);
                            const halfW = Math.min(slot * 0.42, 48);
                            const right = bins.map((c, i) => `${cx + (c / maxC) * halfW},${sy(lo + ((i + 0.5) / nb) * span)}`);
                            const left = bins.map((c, i) => `${cx - (c / maxC) * halfW},${sy(lo + ((i + 0.5) / nb) * span)}`).reverse();
                            return (
                                <g key={s.col}>
                                    <path d={`M${right.join(" L")} L${left.join(" L")} Z`} fill={color}
                                          fillOpacity={0.25} stroke={color} strokeWidth={1.2}/>
                                    <line x1={cx} x2={cx} y1={sy(Math.min(...s.values))} y2={sy(Math.max(...s.values))}
                                          stroke={color} strokeWidth={1} strokeOpacity={0.7}/>
                                </g>
                            );
                        }
                        // beeswarm — deterministic jitter from the value itself
                        const halfW = Math.min(slot * 0.44, 52);
                        return (
                            <g key={s.col}>
                                {s.values.map((v, vi) => {
                                    const jitter = ((Math.sin(v * 12.9898 + vi * 78.233) * 43758.5453) % 1 + 1) % 1;
                                    return <circle key={vi} cx={cx + (jitter - 0.5) * halfW} cy={sy(v)} r={2.2}
                                                   fill={color} fillOpacity={0.75}/>;
                                })}
                            </g>
                        );
                    })}
                    {numericSeries.map((s, si) => (
                        <text key={s.col} x={pad.l + si * slot + slot / 2} y={H - pad.b + 12} textAnchor="middle"
                              className="fill-current text-[8px] opacity-60">
                            {s.header.slice(0, 12)}
                        </text>
                    ))}
                </>
            );
        }
        // ECDF
        const k = numericSeries.length;
        const slot = iw;
        const all = numericSeries.flatMap((s) => s.values);
        const lo = Math.min(...all);
        const hi = Math.max(...all);
        const span = (hi - lo) || 1;
        const sx = (v: number) => pad.l + ((v - lo) / span) * slot;
        return (
            <>
                {[1, 0.75, 0.5, 0.25, 0].map((t, i) => (
                    <g key={i}>
                        <line x1={pad.l} x2={W - pad.r} y1={pad.t + (1 - t) * ih} y2={pad.t + (1 - t) * ih}
                              stroke="currentColor" strokeOpacity={0.12}/>
                        <text x={pad.l - 6} y={pad.t + (1 - t) * ih + 3} textAnchor="end"
                              className="fill-current text-[9px] opacity-60">{fmt(t)}</text>
                    </g>
                ))}
                {numericSeries.map((s, si) => {
                    const sorted = [...s.values].sort((a, b) => a - b);
                    const pts = sorted.map((v, i) => ({x: sx(v), y: pad.t + (1 - (i + 1) / sorted.length) * ih}));
                    return <polyline key={s.col} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none"
                                     stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth={1.8}/>;
                })}
                {[lo, (lo + hi) / 2, hi].map((t, i) => (
                    <text key={i} x={pad.l + (i / 2) * iw} y={H - pad.b + 12} textAnchor="middle"
                          className="fill-current text-[8px] opacity-60">{fmt(t)}</text>
                ))}
                {numericSeries.map((s, si) => (
                    <g key={s.col} transform={`translate(${pad.l + si * 130}, ${H - 8})`}>
                        <rect width={10} height={3} y={-1.5} fill={SERIES_COLORS[si % SERIES_COLORS.length]} rx={1.5}/>
                        <text x={14} y={2} className="fill-current text-[9px]">{s.header.slice(0, 18)}</text>
                    </g>
                ))}
            </>
        );
    };

    /* ── Relationship ─────────────────────────────────────── */
    const renderRelationship = () => {
        const s0 = series[0];
        if (kind === "connected") {
            // Scatter dots joined in row order — the path through time.
            const pts = s0.points
                .filter((p) => Number.isFinite(p.x))
                .map((p) => ({x: p.x, y: p.y as number}));
            if (pts.length < 2) return null;
            const xlo = Math.min(...pts.map((p) => p.x));
            const xhi = Math.max(...pts.map((p) => p.x));
            const sx = (v: number) => pad.l + ((v - xlo) / ((xhi - xlo) || 1)) * iw;
            const sy = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * ih;
            const first = pts[0];
            return (
                <>
                    {yAxis}
                    <polyline points={pts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} fill="none"
                              stroke={SERIES_COLORS[0]} strokeWidth={1.3} strokeOpacity={0.85}/>
                    {pts.map((p, i) => (
                        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={i === 0 ? 4 : 2.2}
                                fill={i === 0 ? "#f59e0b" : SERIES_COLORS[0]}/>
                    ))}
                    <text x={sx(first.x)} y={sy(first.y) - 8} textAnchor="middle" className="fill-current text-[8px]"
                          fill="#f59e0b">start
                    </text>
                    <text x={W / 2} y={H - 6} textAnchor="middle"
                          className="fill-current text-[8px] opacity-60">{series[0]?.header.slice(0, 20)} →
                    </text>
                </>
            );
        }
        if (kind === "scatter-matrix") {
            // Pairwise mini-scatters + a diagonal histogram per column.
            const cols = numericSeries.slice(0, 4);
            if (cols.length < 2) return null;
            const n = cols.length;
            const cellW = iw / n;
            const cellH = ih / n;
            const cell = (k: number, r: number) => ({x: pad.l + k * cellW, y: pad.t + r * cellH});
            const lohi = cols.map((c) => ({lo: Math.min(...c.values), hi: Math.max(...c.values)}));
            return (
                <>
                    {cols.map((_, k) => cols.map((_, r) => {
                        const c = cell(k, r);
                        return <rect key={`${k}-${r}`} x={c.x + 2} y={c.y + 2} width={cellW - 4} height={cellH - 4}
                                     fill="none" stroke="currentColor" strokeOpacity={0.15}/>;
                    }))}
                    {cols.map((cy, r) => cols.map((cx, k) => {
                        if (k === r) {
                            // diagonal histogram of column r
                            const c = cell(k, r);
                            const NB = 10;
                            const {lo, hi} = lohi[r];
                            const counts = new Array(NB).fill(0);
                            for (const v of cy.values) counts[Math.min(NB - 1, Math.floor(((v - lo) / ((hi - lo) || 1)) * NB))]++;
                            const mc = Math.max(...counts, 1);
                            const bw = (cellW - 8) / NB;
                            return (
                                <g key={`d${r}`}>
                                    {counts.map((cnt, b) => (
                                        <rect key={b} x={c.x + 4 + b * bw}
                                              y={c.y + cellH - 4 - (cnt / mc) * (cellH - 10)}
                                              width={Math.max(1, bw - 1)} height={(cnt / mc) * (cellH - 10)}
                                              fill={SERIES_COLORS[r % SERIES_COLORS.length]} fillOpacity={0.5}/>
                                    ))}
                                    <text x={c.x + 6} y={c.y + 12}
                                          className="fill-current text-[7px] opacity-70">{cy.header.slice(0, 10)}</text>
                                </g>
                            );
                        }
                        const c = cell(k, r);
                        const xh = lohi[k];
                        const yh = lohi[r];
                        const px = (v: number) => c.x + 4 + ((v - xh.lo) / ((xh.hi - xh.lo) || 1)) * (cellW - 8);
                        const py = (v: number) => c.y + cellH - 4 - ((v - yh.lo) / ((yh.hi - yh.lo) || 1)) * (cellH - 8);
                        return (
                            <g key={`p${r}-${k}`}>
                                {cy.values.map((_, i) => {
                                    const xv = cx.values[i];
                                    if (xv === undefined) return null;
                                    return <circle key={i} cx={px(xv)} cy={py(cy.values[i])} r={1.6}
                                                   fill={SERIES_COLORS[(r + k) % SERIES_COLORS.length]}
                                                   fillOpacity={0.75}/>;
                                })}
                            </g>
                        );
                    }))}
                    {cols.map((c, k) => (
                        <text key={k} x={cell(k, 0).x + cellW / 2} y={H - 6} textAnchor="middle"
                              className="fill-current text-[7px] opacity-70">{c.header.slice(0, 10)}</text>
                    ))}
                </>
            );
        }
        if (kind === "bubble") {
            const sizeVals = series[1]?.points.map((p) => p.y as number) ?? [];
            const sizeMax = Math.max(...sizeVals, 1);
            const xs = s0.points.map((p) => p.x);
            const xLo = Math.min(...xs);
            const xHi = Math.max(...xs);
            const xSpan = xHi - xLo || 1;
            const sx = (v: number) => pad.l + ((v - xLo) / xSpan) * iw;
            return (
                <>
                    {yAxis}
                    {s0.points.map((p, i) => (
                        <circle
                            key={i}
                            cx={sx(Number.isFinite(p.x) ? p.x : 0)}
                            cy={yScale(p.y as number)}
                            r={4 + ((sizeVals[i] ?? 0) / sizeMax) * 14}
                            fill={SERIES_COLORS[0]}
                            fillOpacity={0.45}
                            stroke={SERIES_COLORS[0]}
                            strokeWidth={0.6}
                        />
                    ))}
                    <g transform={`translate(${pad.l}, ${H - 8})`}>
                        <circle cx={5} cy={0} r={5} fill={SERIES_COLORS[0]} fillOpacity={0.45}/>
                        <text x={16} y={2} className="fill-current text-[9px]">size
                            = {series[1]?.header.slice(0, 14) ?? "2nd series"}</text>
                    </g>
                </>
            );
        }
        if (kind === "heatmap") {
            const pts = s0.points.filter((p) => Number.isFinite(p.x));
            const xLo = Math.min(...pts.map((p) => p.x));
            const xHi = Math.max(...pts.map((p) => p.x));
            const xSpan = xHi - xLo || 1;
            const yLo = yMin;
            const yHi = rawYMax;
            const ySpan = yHi - yLo || 1;
            const NX = 12, NY = 8;
            const grid: number[][] = Array.from({length: NY}, () => new Array(NX).fill(0));
            for (const p of pts) {
                const i = Math.min(NX - 1, Math.floor(((p.x - xLo) / xSpan) * NX));
                const j = Math.min(NY - 1, Math.max(0, Math.floor(((p.y as number) - yLo) / ySpan) * NY));
                grid[NY - 1 - j][i] += 1;
            }
            const max = Math.max(...grid.flat(), 1);
            const cw = iw / NX;
            const chh = ih / NY;
            const colorFor = (v: number) => {
                const t = v / max;
                const idx = Math.min(HEAT_STOPS.length - 2, Math.floor(t * (HEAT_STOPS.length - 1)));
                return HEAT_STOPS[idx];
            };
            return (
                <>
                    {grid.map((row, j) =>
                        row.map((c, i) => (
                            <rect key={`${i}-${j}`} x={pad.l + i * cw} y={pad.t + j * chh} width={cw - 0.5}
                                  height={chh - 0.5} fill={colorFor(c)}
                                  fillOpacity={c === 0 ? 0.06 : 0.55 + 0.45 * (c / max)}/>
                        ))
                    )}
                    <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="none" stroke="currentColor"
                          strokeOpacity={0.15}/>
                    {[xLo, (xLo + xHi) / 2, xHi].map((t, i) => (
                        <text key={i} x={pad.l + (i / 2) * iw} y={H - pad.b + 12} textAnchor="middle"
                              className="fill-current text-[8px] opacity-60">{fmt(t)}</text>
                    ))}
                    {[yLo, (yLo + yHi) / 2, yHi].map((t, i) => (
                        <text key={i} x={pad.l - 6} y={pad.t + ih - (i / 2) * ih + 3} textAnchor="end"
                              className="fill-current text-[8px] opacity-60">{fmt(t)}</text>
                    ))}
                </>
            );
        }
        // scatter / scatter+trend
        const pts = s0.points.filter((p) => Number.isFinite(p.x));
        const xLo = Math.min(...pts.map((p) => p.x));
        const xHi = Math.max(...pts.map((p) => p.x));
        const xSpan = xHi - xLo || 1;
        const sx = (v: number) => pad.l + ((v - xLo) / xSpan) * iw;
        const trendPath = (() => {
            if (kind !== "scatter-trend" || pts.length < 2) return null;
            const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
            const my = pts.reduce((s, p) => s + (p.y as number), 0) / pts.length;
            const denom = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0) || 1;
            const b = pts.reduce((s, p) => s + (p.x - mx) * ((p.y as number) - my), 0) / denom;
            const a = my - b * mx;
            return {x1: sx(xLo), y1: yScale(a + b * xLo), x2: sx(xHi), y2: yScale(a + b * xHi)};
        })();
        return (
            <>
                {yAxis}
                {series.map((s, si) =>
                    s.points
                        .filter((p) => Number.isFinite(p.x))
                        .map((p, i) => (
                            <circle key={`${s.col}-${i}`} cx={sx(p.x)} cy={yScale(p.y as number)} r={2.6}
                                    fill={SERIES_COLORS[si % SERIES_COLORS.length]} opacity={0.85}/>
                        ))
                )}
                {trendPath &&
                  <line x1={trendPath.x1} y1={trendPath.y1} x2={trendPath.x2} y2={trendPath.y2} stroke="#f59e0b"
                        strokeWidth={1.6}/>}
                {trendPath && (
                    <g transform={`translate(${pad.l}, ${H - 8})`}>
                        <rect width={10} height={3} y={-1.5} fill="#f59e0b" rx={1.5}/>
                        <text x={14} y={2} className="fill-current text-[9px]">least-squares trend</text>
                    </g>
                )}
            </>
        );
    };

    /* ── Proportion ───────────────────────────────────────── */
    const renderProportion = () => {
        const items = categoryAgg.slice(0, 10);
        const total = items.reduce((s, x) => s + x.value, 0) || 1;
        if (kind === "waffle") {
            // 10×10 grid — one square per whole 1% of the total.
            const top = items.slice(0, 5);
            const share = top.map((x) => x.value / total);
            const cells: Array<{ k: number; filled: boolean }> = [];
            let k = 0;
            for (let i = 0; i < 100; i++) {
                let acc = 0;
                let owner = -1;
                for (let j = 0; j < top.length; j++) {
                    acc += share[j] * 100;
                    if (i < Math.round(acc)) {
                        owner = j;
                        break;
                    }
                }
                if (owner < 0) owner = Math.min(top.length - 1, k);
                cells.push({k: owner, filled: true});
                k++;
            }
            const size = Math.min(iw, ih) / 10 - 2;
            const ox = pad.l + (iw - (size + 2) * 10) / 2;
            const oy = pad.t + (ih - (size + 2) * 10) / 2;
            return (
                <>
                    {cells.map((c, i) => (
                        <rect
                            key={i}
                            x={ox + (i % 10) * (size + 2)}
                            y={oy + Math.floor(i / 10) * (size + 2)}
                            width={size}
                            height={size}
                            rx={1.5}
                            fill={SERIES_COLORS[c.k % SERIES_COLORS.length]}
                            fillOpacity={0.85}
                        />
                    ))}
                    {top.map((x, j) => (
                        <g key={j} transform={`translate(${pad.l + j * 88}, ${H - 8})`}>
                            <rect width={8} height={8} y={-7} fill={SERIES_COLORS[j % SERIES_COLORS.length]} rx={1.5}/>
                            <text x={12} y={0}
                                  className="fill-current text-[8px]">{x.label.slice(0, 10)} {Math.round(share[j] * 100)}%
                            </text>
                        </g>
                    ))}
                </>
            );
        }
        if (kind === "pie" || kind === "donut") {
            const cx = W / 2;
            const cy = H / 2 - 6;
            const R = Math.min(iw, ih) / 2;
            const rIn = kind === "donut" ? R * 0.58 : 0;
            let angle = -Math.PI / 2;
            return (
                <>
                    {items.map((it, i) => {
                        const frac = it.value / total;
                        const a2 = angle + frac * Math.PI * 2;
                        const large = frac > 0.5 ? 1 : 0;
                        const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
                        const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
                        const xi2 = cx + rIn * Math.cos(a2), yi2 = cy + rIn * Math.sin(a2);
                        const xi1 = cx + rIn * Math.cos(angle), yi1 = cy + rIn * Math.sin(angle);
                        const d =
                            rIn > 0
                                ? `M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${rIn},${rIn} 0 ${large} 0 ${xi1},${yi1} Z`
                                : `M${cx},${cy} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} Z`;
                        const mid = (angle + a2) / 2;
                        const lx = cx + (R + 12) * Math.cos(mid);
                        const ly = cy + (R + 12) * Math.sin(mid);
                        const wedge = <path key={i} d={d} fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                                            fillOpacity={0.85} stroke="var(--background, #fff)" strokeWidth={1}/>;
                        angle = a2;
                        return (
                            <g key={i}>
                                {wedge}
                                <text x={lx} y={ly} textAnchor={Math.cos(mid) > 0 ? "start" : "end"}
                                      className="fill-current text-[8px] opacity-80">
                                    {it.label.slice(0, 10)} {(frac * 100).toFixed(0)}%
                                </text>
                            </g>
                        );
                    })}
                    {kind === "donut" && (
                        <text x={W / 2} y={H / 2 - 4} textAnchor="middle"
                              className="fill-current text-[13px] font-semibold">
                            {fmt(total)}
                        </text>
                    )}
                </>
            );
        }
        if (kind === "treemap") {
            const slices = treemapSlices(items, pad.l, pad.t, iw, ih - 8);
            return (
                <>
                    {slices.map((sl, i) => (
                        <g key={i}>
                            <rect x={sl.x + 1} y={sl.y + 1} width={Math.max(0, sl.w - 2)} height={Math.max(0, sl.h - 2)}
                                  fill={SERIES_COLORS[i % SERIES_COLORS.length]} fillOpacity={0.72} rx={3}/>
                            {sl.w > 44 && sl.h > 16 && (
                                <text x={sl.x + 6} y={sl.y + 14} className="fill-current text-[9px] font-medium">
                                    {sl.label.slice(0, Math.floor(sl.w / 6))} · {(sl.value / total * 100).toFixed(0)}%
                                </text>
                            )}
                        </g>
                    ))}
                </>
            );
        }
        // 100% stacked bar — per-category shares of the first few X rows
        const cats = categoryAgg.slice(0, 8);
        const rowsCount = Math.min(cats.length, series.length ? series[0].points.length : 0, 8) || Math.min(cats.length, 8);
        const catTotals = cats.map((c) => c.value);
        const sumTot = catTotals.reduce((s, v) => s + v, 0) || 1;
        let acc = 0;
        return (
            <>
                {cats.map((c, i) => {
                    const share = c.value / sumTot;
                    const x = pad.l + (acc / sumTot) * iw;
                    acc += c.value;
                    const w = (c.value / sumTot) * iw;
                    return (
                        <g key={i}>
                            <rect x={x + 0.5} y={pad.t + ih * 0.25} width={Math.max(0, w - 1)} height={ih * 0.5}
                                  fill={SERIES_COLORS[i % SERIES_COLORS.length]} fillOpacity={0.85}/>
                            {w > 34 && (
                                <text x={x + w / 2} y={pad.t + ih * 0.5 + 3} textAnchor="middle"
                                      className="fill-current text-[8px]">
                                    {(share * 100).toFixed(0)}%
                                </text>
                            )}
                            <text x={x + w / 2} y={pad.t + ih * 0.25 - 4} textAnchor="middle"
                                  className="fill-current text-[8px] opacity-60">
                                {c.label.slice(0, 8)}
                            </text>
                        </g>
                    );
                })}
                <text x={pad.l - 6} y={pad.t + ih * 0.5 + 3} textAnchor="end"
                      className="fill-current text-[8px] opacity-60">100%
                </text>
            </>
        );
    };

    /* ── Radial ───────────────────────────────────────────── */
    const renderRadar = () => {
        if (kind === "rose") {
            // Nightingale rose — equal-angle wedges, AREA ∝ value (r ∝ √v so
            // the wedge AREA stays proportional).
            const cats = categoryAgg.slice(0, 14);
            const cx = W / 2;
            const cy = H / 2 + 4;
            const R = Math.min(iw, ih) / 2 - 16;
            const vmax = Math.max(...cats.map((c) => c.value), 1);
            const N = cats.length || 1;
            const ang = (i: number) => (i / N) * Math.PI * 2 - Math.PI / 2;
            const rOf = (v: number) => Math.sqrt(Math.max(0, v) / vmax) * R;
            return (
                <>
                    {[0.33, 0.66, 1].map((f, i) => (
                        <circle key={i} cx={cx} cy={cy} r={R * f} fill="none" stroke="currentColor"
                                strokeOpacity={0.1}/>
                    ))}
                    {cats.map((c, i) => {
                        const a0 = ang(i);
                        const a1 = ang(i + 1);
                        const r = rOf(c.value);
                        const x0 = cx + r * Math.cos(a0);
                        const y0 = cy + r * Math.sin(a0);
                        const x1 = cx + r * Math.cos(a1);
                        const y1 = cy + r * Math.sin(a1);
                        const large = a1 - a0 > Math.PI ? 1 : 0;
                        return (
                            <path
                                key={i}
                                d={`M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`}
                                fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                                fillOpacity={0.75}
                                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                                strokeWidth={0.8}
                            />
                        );
                    })}
                    {cats.map((c, i) => (
                        <text
                            key={i}
                            x={cx + (R + 10) * Math.cos(ang(i) + Math.PI / N)}
                            y={cy + (R + 10) * Math.sin(ang(i) + Math.PI / N) + 3}
                            textAnchor="middle"
                            className="fill-current text-[7px] opacity-70"
                        >
                            {c.label.slice(0, 8)}
                        </text>
                    ))}
                </>
            );
        }

        const cats = categoryAgg.slice(0, 10);
        const cx = W / 2;
        const cy = H / 2 + 4;
        const R = Math.min(iw, ih) / 2 - 14;
        const angle = (i: number) => (i / cats.length) * Math.PI * 2 - Math.PI / 2;
        const allVals = numericSeries.flatMap((s) => s.values).length
            ? numericSeries.flatMap((s) => s.values)
            : series.flatMap((s) => s.points.map((p) => p.y as number));
        const vmax = Math.max(...allVals, 1);
        return (
            <>
                {[0.25, 0.5, 0.75, 1].map((f, i) => (
                    <polygon
                        key={i}
                        points={cats.map((_, j) => `${cx + R * f * Math.cos(angle(j))},${cy + R * f * Math.sin(angle(j))}`).join(" ")}
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity={0.12}
                    />
                ))}
                {cats.map((c, j) => (
                    <g key={j}>
                        <line x1={cx} y1={cy} x2={cx + R * Math.cos(angle(j))} y2={cy + R * Math.sin(angle(j))}
                              stroke="currentColor" strokeOpacity={0.12}/>
                        <text
                            x={cx + (R + 12) * Math.cos(angle(j))}
                            y={cy + (R + 12) * Math.sin(angle(j)) + 3}
                            textAnchor="middle"
                            className="fill-current text-[8px] opacity-70"
                        >
                            {c.label.slice(0, 9)}
                        </text>
                    </g>
                ))}
                {series.map((s, si) => {
                    const map = new Map<string, number>();
                    for (const p of s.points) map.set(p.label || "—", (map.get(p.label || "—") ?? 0) + (p.y as number));
                    const pts = cats.map((c, j) => {
                        const v = map.get(c.label) ?? 0;
                        const f = Math.min(1, v / vmax);
                        return `${cx + R * f * Math.cos(angle(j))},${cy + R * f * Math.sin(angle(j))}`;
                    });
                    return (
                        <polygon
                            key={s.col}
                            points={pts.join(" ")}
                            fill={SERIES_COLORS[si % SERIES_COLORS.length]}
                            fillOpacity={0.15}
                            stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
                            strokeWidth={1.6}
                        />
                    );
                })}
                {series.map((s, si) => (
                    <g key={s.col} transform={`translate(${pad.l + si * 130}, ${H - 6})`}>
                        <rect width={10} height={3} y={-1.5} fill={SERIES_COLORS[si % SERIES_COLORS.length]} rx={1.5}/>
                        <text x={14} y={2} className="fill-current text-[9px]">{s.header.slice(0, 18)}</text>
                    </g>
                ))}
            </>
        );
    };

    /* ── Ranking ─────────────────────────────────────────── */
    const renderRanking = () => {
        if (kind === "lollipop") {
            const s = series[0];
            const shown = s.points.slice(0, 20);
            const vals = shown.map((p) => p.y as number);
            const max = Math.max(...vals.map(Math.abs), 1);
            const rowsCount = shown.length;
            const rh = ih / Math.max(1, rowsCount);
            const zero = pad.l + (max > 0 && Math.min(...vals) < 0 ? iw / 2 : 0);
            const scale = (v: number) => (v / max) * (iw / 2 - 6);
            return (
                <>
                    {shown.map((p, i) => {
                        const v = (p.y as number) || 0;
                        const x2 = zero + scale(v) * (max > 0 && Math.min(...vals) < 0 ? 1 : 1);
                        const len = Math.abs(scale(v));
                        const x = v >= 0 ? zero : zero - len;
                        return (
                            <g key={i}>
                                <line x1={zero} x2={x2} y1={pad.t + i * rh + rh / 2} y2={pad.t + i * rh + rh / 2}
                                      stroke="currentColor" strokeOpacity={0.25} strokeWidth={1.2}/>
                                <circle cx={x2} cy={pad.t + i * rh + rh / 2} r={Math.min(4.5, rh * 0.3)}
                                        fill={SERIES_COLORS[0]}/>
                                <text x={zero - 6} y={pad.t + i * rh + rh / 2 + 3} textAnchor="end"
                                      className="fill-current text-[8px] opacity-60">{(p.label || String(p.x)).slice(0, 11)}</text>
                            </g>
                        );
                    })}
                    <line x1={zero} x2={zero} y1={pad.t} y2={pad.t + ih} stroke="currentColor" strokeOpacity={0.3}/>
                </>
            );
        }
        if (kind === "slope") {
            const lo = Math.min(...series.flatMap((s) => s.points.slice(0, 1).concat(s.points.slice(-1)).map((p) => p.y as number)));
            const hi = Math.max(...series.flatMap((s) => s.points.slice(0, 1).concat(s.points.slice(-1)).map((p) => p.y as number)));
            const yv = (v: number) => pad.t + (1 - (v - lo) / ((hi - lo) || 1)) * ih;
            const x0 = pad.l + iw * 0.15;
            const x1 = pad.l + iw * 0.85;
            return (
                <>
                    {[lo, (lo + hi) / 2, hi].map((v, i) => (
                        <g key={i}>
                            <line x1={x0} x2={x1} y1={yv(v)} y2={yv(v)} stroke="currentColor" strokeOpacity={0.1}/>
                            <text x={x0 - 8} y={yv(v) + 3} textAnchor="end"
                                  className="fill-current text-[8px] opacity-60">{fmt(v)}</text>
                        </g>
                    ))}
                    {series.map((s, si) => {
                        const first = s.points[0]?.y as number;
                        const last = s.points[s.points.length - 1]?.y as number;
                        const up = last >= first;
                        return (
                            <g key={s.col}>
                                <line x1={x0} x2={x1} y1={yv(first)} y2={yv(last)}
                                      stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth={2}/>
                                <circle cx={x0} cy={yv(first)} r={3.5} fill={SERIES_COLORS[si % SERIES_COLORS.length]}/>
                                <circle cx={x1} cy={yv(last)} r={3.5} fill={SERIES_COLORS[si % SERIES_COLORS.length]}/>
                                <text x={x0 - 8} y={yv(first) + 3} textAnchor="end"
                                      className="fill-current text-[8px]">{fmt(first)}</text>
                                <text x={x1 + 8} y={yv(last) + 3} className="fill-current text-[8px]">{fmt(last)}</text>
                                <text x={x1 + 8} y={yv(last) - 7}
                                      className="fill-current text-[8px] opacity-70">{up ? "▲" : "▼"}</text>
                            </g>
                        );
                    })}
                    <text x={x0} y={H - 8} textAnchor="middle" className="fill-current text-[9px] opacity-60">first
                    </text>
                    <text x={x1} y={H - 8} textAnchor="middle" className="fill-current text-[9px] opacity-60">last
                    </text>
                    {series.length === 1 && (
                        <text x={(x0 + x1) / 2} y={pad.t + 10} textAnchor="middle"
                              className="fill-current text-[9px] opacity-60">{series[0].header.slice(0, 24)}</text>
                    )}
                    {legend}
                </>
            );
        }
        if (kind === "bullet") {
            const s = series[0];
            const all = s.points.map((p) => p.y as number);
            const mean = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
            const hi = Math.max(...all, mean, 1);
            const shown = s.points.slice(0, 14);
            const rowsCount = shown.length;
            const rh = ih / Math.max(1, rowsCount);
            const sv = (v: number) => pad.l + (v / hi) * (iw - 10);
            return (
                <>
                    {shown.map((p, i) => {
                        const v = (p.y as number) || 0;
                        return (
                            <g key={i}>
                                <rect x={pad.l} y={pad.t + i * rh + rh * 0.18} width={Math.max(1, sv(v) - pad.l)}
                                      height={rh * 0.64} fill={SERIES_COLORS[0]} fillOpacity={0.45} rx={2}/>
                                <text x={pad.l - 6} y={pad.t + i * rh + rh / 2 + 3} textAnchor="end"
                                      className="fill-current text-[8px] opacity-60">{(p.label || String(p.x)).slice(0, 10)}</text>
                            </g>
                        );
                    })}
                    <line x1={sv(mean)} x2={sv(mean)} y1={pad.t} y2={pad.t + ih} stroke="#d97706" strokeWidth={2}/>
                    <text x={sv(mean) + 4} y={pad.t + 10} className="fill-current text-[8px]"
                          fill="#d97706">mean {fmt(mean)}</text>
                    {[hi, hi / 2, 0].map((v, i) => (
                        <text key={i} x={pad.l + (v / hi) * (iw - 10)} y={H - 8} textAnchor="middle"
                              className="fill-current text-[8px] opacity-60">{fmt(v)}</text>
                    ))}
                </>
            );
        }
        // parallel coordinates
        {
            const cols = numericSeries.slice(0, 4);
            const norms = cols.map((c) => {
                const lo = Math.min(...c.values);
                const hi = Math.max(...c.values);
                return c.values.map((v) => (v - lo) / ((hi - lo) || 1));
            });
            const rowsN = Math.min(36, norms[0]?.length ?? 0);
            const axisX = (k: number) => pad.l + (cols.length === 1 ? iw / 2 : (k / (cols.length - 1)) * iw);
            const yAt = (f: number) => pad.t + (1 - f) * ih;
            return (
                <>
                    {cols.map((c, k) => (
                        <g key={c.col}>
                            <line x1={axisX(k)} x2={axisX(k)} y1={pad.t} y2={pad.t + ih} stroke="currentColor"
                                  strokeOpacity={0.25}/>
                            <text x={axisX(k)} y={H - 8} textAnchor="middle"
                                  className="fill-current text-[8px] opacity-70">{c.header.slice(0, 12)}</text>
                            <text x={axisX(k)} y={pad.t - 4} textAnchor="middle"
                                  className="fill-current text-[8px] opacity-60">{fmt(Math.max(...c.values))}</text>
                        </g>
                    ))}
                    {Array.from({length: rowsN}, (_, r) => (
                        <polyline
                            key={r}
                            points={norms.map((nv, k) => `${axisX(k)},${yAt(nv[r] ?? 0)}`).join(" ")}
                            fill="none"
                            stroke={SERIES_COLORS[r % SERIES_COLORS.length]}
                            strokeOpacity={0.45}
                            strokeWidth={1}
                        />
                    ))}
                </>
            );
        }
    };

    /* ── Statistics ───────────────────────────────────────── */
    const renderStatistics = () => {
        if (kind === "qq") {
            const vals = [...(numericSeries[0]?.values ?? [])].sort((a, b) => a - b);
            if (vals.length < 2) return null;
            const n = vals.length;
            const mu = vals.reduce((a, b) => a + b, 0) / n;
            const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mu) ** 2, 0) / n) || 1;
            // Normal quantiles via the Beasley-Springer-Moro approximation.
            const invNorm = (p: number) => {
                const a = [-3.969687327, 218.5241237, -1595.058578, 3661.450578, -4209.028559, 1656.506482];
                const b = [27.43336342, -174.9040265, 1013.255622, -3901.895663, 24519.48219, -34433.05377];
                const c = [-7.784894002, -3.224969928, -2.445376576, -1.63706581, -0.947890915, -0.321049937, 0.564189584];
                const d = [0.841768103, 0.297873054, -0.117750207, -0.573436571, -1.76075445, 0.1];
                const pl = 0.02425;
                if (p < pl) {
                    const q = Math.sqrt(-2 * Math.log(p));
                    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) * q + c[6];
                }
                if (p > 1 - pl) {
                    const q = Math.sqrt(-2 * Math.log(1 - p));
                    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) * q - c[6];
                }
                const q = p - 0.5;
                const r = q * q;
                return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
                    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + b[5]) * r + 1;
            };
            const pts = vals.map((v, i) => ({x: invNorm((i + 0.5) / n) * sd + mu, y: v}));
            const xs = pts.map((p) => p.x);
            const ys = pts.map((p) => p.y);
            const lo = Math.min(...xs, ...ys);
            const hi = Math.max(...xs, ...ys);
            const sc = (v: number) => pad.l + ((v - lo) / ((hi - lo) || 1)) * iw;
            const sy = (v: number) => pad.t + (1 - (v - lo) / ((hi - lo) || 1)) * ih;
            return (
                <>
                    {yTicks.map((_, i) => (
                        <line key={i} x1={pad.l} x2={W - pad.r} y1={pad.t + (ih * i) / ticks}
                              y2={pad.t + (ih * i) / ticks} stroke="currentColor" strokeOpacity={0.12}/>
                    ))}
                    <line x1={sc(lo)} y1={sy(lo)} x2={sc(hi)} y2={sy(hi)} stroke="#d97706" strokeWidth={1.4}/>
                    {pts.map((p, i) => (
                        <circle key={i} cx={sc(p.x)} cy={sy(p.y)} r={2.4} fill={SERIES_COLORS[0]} fillOpacity={0.8}/>
                    ))}
                    <text x={W / 2} y={H - 6} textAnchor="middle"
                          className="fill-current text-[8px] opacity-60">theoretical quantiles →
                    </text>
                    <text x={10} y={pad.t + ih / 2} textAnchor="middle" transform={`rotate(-90 10 ${pad.t + ih / 2})`}
                          className="fill-current text-[8px] opacity-60">sample quantiles
                    </text>
                </>
            );
        }
        if (kind === "cumsum") {
            const s = series[0];
            let acc = 0;
            const cums = s.points.map((p) => (acc += p.y as number));
            const hi = Math.max(...cums.map(Math.abs), 1);
            const lo = Math.min(...cums, 0);
            const sy = (v: number) => pad.t + (1 - (v - lo) / ((hi - lo) || 1)) * ih;
            const pts = cums.map((v, i) => ({x: xScale(i), y: sy(v)}));
            return (
                <>
                    {yTicks.map((_, i) => (
                        <g key={i}>
                            <line x1={pad.l} x2={W - pad.r} y1={pad.t + (ih * i) / ticks} y2={pad.t + (ih * i) / ticks}
                                  stroke="currentColor" strokeOpacity={0.12}/>
                        </g>
                    ))}
                    {lo < 0 &&
                      <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} stroke="currentColor" strokeOpacity={0.4}/>}
                    <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={SERIES_COLORS[0]}
                              strokeWidth={1.8}/>
                    {series[0]?.points.map((p, i) =>
                        i % xStep === 0 ? (
                            <text key={i} x={xScale(i)} y={H - pad.b + 12} textAnchor="middle"
                                  className="fill-current text-[8px] opacity-60">{(p.label || String(p.x)).slice(0, 8)}</text>
                        ) : null
                    )}
                    <text x={pad.l - 6} y={pad.t + 8} textAnchor="end"
                          className="fill-current text-[8px] opacity-60">{fmt(hi)}</text>
                    <text x={pad.l - 6} y={pad.t + ih} textAnchor="end"
                          className="fill-current text-[8px] opacity-60">{fmt(lo)}</text>
                </>
            );
        }
        // rolling mean (window 7) — one smooth line per series
        {
            const window = 7;
            const sy = (v: number) => yScale(v);
            return (
                <>
                    {yAxis}
                    {series.map((s, si) => {
                        const vals = s.points.map((p) => p.y as number);
                        const means = vals.map((_, i) => {
                            const from = Math.max(0, i - window + 1);
                            const slice = vals.slice(from, i + 1);
                            return slice.reduce((a, b) => a + b, 0) / slice.length;
                        });
                        const pts = means.map((v, i) => ({x: xScale(i), y: sy(v)}));
                        return <polyline key={s.col} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none"
                                         stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth={2.2}/>;
                    })}
                    {legend}
                </>
            );
        }
    };

    const body = (() => {
        switch (specOf(kind).category) {
            case "Trends":
                return renderTrends();
            case "Bars":
                return renderBars();
            case "Distribution":
                return renderDistribution();
            case "Relationship":
                return renderRelationship();
            case "Proportion":
                return renderProportion();
            case "Radial":
                return renderRadar();
            case "Ranking":
                return renderRanking();
            case "Statistics":
                return renderStatistics();
            default:
                return renderTrends();
        }
    })();

    return (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-full min-h-[220px]" role="img"
             aria-label={`${specOf(kind).label} chart preview`}>
            {body}
        </svg>
    );
}
