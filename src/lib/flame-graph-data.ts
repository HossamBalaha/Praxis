/**
 * flame-graph-data.ts — the PURE logic behind the profiler flame graph
 * (src/components/flame-graph.tsx owns the canvas + pointer events).
 *
 * Everything here is DOM-free and unit-tested:
 *   · pstats location parsing  — `main.py:42(func)` / `~:0(<built-in
 *     method print>)` / `{built-in method print}` → {name, file, line,
 *     module}. Module = path basename, computed with BOTH `/` and `\`
 *     separators so a profile produced on Windows renders identically.
 *   · pseudo call-tree derivation — `/api/profile` returns cProfile's
 *     FLAT stats table (top rows by cumulative time; the .pstats binary
 *     it also writes is not browser-parseable). A visual call tree is
 *     derived with a best-fit-decreasing nesting: rows are sorted by
 *     cumulative time and each row is placed under the placed frame
 *     whose remaining child capacity (`cum − self − placed children`)
 *     still covers the row — the TIGHTEST such fit. In a single-threaded
 *     cProfile run, a caller's cumulative time always covers its
 *     callees' cumulative time exactly, so tight-fit tends to recover
 *     the real parent/child edges and the frame WIDTHS are exact even
 *     where the parent/child guess is not. When no slot fits (flat rows
 *     can overlap once several siblings saturate a parent) the row
 *     falls to the synthetic root and the layout pass scales it down.
 *   · layout — depth/x/width rect math with zoom (subtree re-rooting),
 *     "(other)" aggregation of sub-pixel siblings and a depth cap for
 *     pathologically deep stacks (recursion).
 *   · module colors — a stable FNV-1a hash of the module name into a
 *     WARM palette (flame-graph convention). No blues/indigo by design.
 *   · formatting — adaptive seconds + ncalls parsing for the tooltip.
 *
 * The richer input shape: when `/api/profile` starts returning real
 * call trees, pass `tree` (FlameNode[]) to buildFlameTree and skip the
 * pseudo derivation entirely — same layout, same rendering.
 */

// ── flat pstats rows (the app's current /api/profile shape) ──────────

/** One row of cProfile's stats table as parsed by /api/profile.
 *  `ncalls` keeps its raw text ("10" or "10/3" = total/primitive). */
export interface PstatsRow {
    ncalls: string;
    tottime: number;
    cumtime: number;
    location: string;
}

/** Parsed ncalls cell: "10/3" → { total: 10, primitive: 3 }. */
export function parseNcalls(ncalls: string): { total: number; primitive: number | null } {
    const m = /^(\d+)(?:\/(\d+))?$/.exec((ncalls ?? "").trim());
    if (!m) return {total: 0, primitive: null};
    return {total: Number(m[1]), primitive: m[2] ? Number(m[2]) : null};
}

// ── call-tree shape ────────────────────────────────────────────────

/**
 * A frame of the call tree. This is the DOCUMENTED richer shape the
 * component accepts via its `tree` prop (for when /api/profile grows a
 * real call-tree response): nodes only need `name` + `cumulative`;
 * everything else enriches the tooltip and the module color hash.
 */
export interface FlameNode {
    /** Stable identity for zoom/breadcrumbs; assigned during ingestion
     *  when omitted (so callers can pass plain JSON without ids). */
    id?: string;
    /** Function name shown in the rect + tooltip (prefer the short form,
     *  e.g. "print" over "<built-in method print>"). */
    name: string;
    /** Module key for the color hash — defaults to basename(file) / "~". */
    module?: string;
    /** Source file for the tooltip ("~" = built-in / no file). */
    file?: string;
    /** 1-based definition line for the tooltip. */
    line?: number;
    /** Cumulative seconds (self + callees) — drives rect WIDTH. */
    cumulative: number;
    /** Self (tottime) seconds — drawn as the gap left of the children. */
    self?: number;
    /** Total calls; raw "a/b" text is kept in ncallsRaw for the tooltip. */
    calls?: number;
    ncallsRaw?: string;
    children?: FlameNode[];
}

// ── location parsing ────────────────────────────────────────────────

export interface ParsedLocation {
    name: string;
    file: string;
    line: number;
    module: string;
}

/**
 * Parse a pstats `filename:lineno(function)` cell.
 *
 * Observed shapes across CPython builds:
 *   · `/home/u/x/main.py:20(main)`          — regular function
 *   · `~:0(<built-in method exec>)`         — built-in (file is "~")
 *   · `{built-in method builtins.print}`    — brace form (some builds)
 *   · `<string>:1(<module>)`                 — exec'd script frame
 * Windows paths use `\` as the separator — moduleOf splits on BOTH.
 */
export function parsePstatsLocation(location: string): ParsedLocation {
    const loc = (location ?? "").trim();
    if (!loc) return {name: "(unknown)", file: "~", line: 0, module: "~"};
    // Brace form: {built-in method xyz}
    if (loc.startsWith("{") && loc.endsWith("}")) {
        return {name: loc.slice(1, -1), file: "~", line: 0, module: "~"};
    }
    const m = /^(.*):(\d+)\((.*)\)$/.exec(loc);
    if (m) {
        const file = m[1] || "~";
        return {name: m[3] || "(unknown)", file, line: Number(m[2]) || 0, module: moduleOf(file)};
    }
    // Pathological cell — keep it verbatim so the user still sees it.
    return {name: loc, file: "~", line: 0, module: "~"};
}

/** Module key = path basename (both separators), "~" for built-ins. */
export function moduleOf(file: string): string {
    if (!file || file === "~") return "~";
    const base = file.split(/[\\/]/).pop() ?? file;
    return base || file;
}

/**
 * Shorten a raw function name for the rect label: strip CPython's
 * verbose wrappers so narrow frames stay readable. The tooltip keeps
 * the FULL name — only the drawn label uses this.
 */
export function shortFrameName(name: string): string {
    let n = (name ?? "").trim();
    if (!n) return "(unknown)";
    // "<module>" stays verbatim — collapsing it to "module" would read as
    // an ordinary function named module (the exec'd script's top frame).
    if (n === "<module>") return n;
    if (n.startsWith("<") && n.endsWith(">")) {
        n = n.slice(1, -1);
        const bi = n.indexOf("built-in method ");
        if (bi === 0) return n.slice("built-in method ".length);
        const bf = n.indexOf("built-in function ");
        if (bf === 0) return n.slice("built-in function ".length);
        // "<method 'append' of 'list' objects>" → "'append'"
        const q = n.match(/^method\s+'(.*)'\s+of\s+/);
        if (q) return q[1];
        return n; // "<module>" and friends
    }
    return n;
}

// ── tree ingestion + pseudo call-tree from flat rows ────────────────

/** Everything buildFlameTree can turn into a rendering tree. */
export interface FlameGraphSource {
    /** Rich call tree (preferred — see FlameNode). */
    tree?: FlameNode[];
    /** Flat pstats rows (the current /api/profile shape). */
    rows?: PstatsRow[];
}

/** A normalized tree: root + stable node keys + lookup by key. */
export interface FlameTree {
    root: FlameNode;
    /** Cumulative seconds of the root — the "% of total" denominator. */
    total: number;
    /** Number of real frames (synthetic root excluded). */
    frameCount: number;
    /** Stable per-build key for a node (WeakMap-backed; ids honored when
     *  present). Used as the zoom/breadcrumb handle in the component. */
    keyOf: (n: FlameNode) => string;
    /** key → {node, parent, depth, path (root…node inclusive)}. */
    byKey: Map<string, FlameEntry>;
}

export interface FlameEntry {
    node: FlameNode;
    parent: FlameNode | null;
    depth: number;
    /** Root→…→node inclusive — the breadcrumb path source. */
    path: FlameNode[];
}

/** One placed frame in the synthetic root (the "<script>" wrapper). */
const SYNTHETIC_ROOT_KEY = "root";

/**
 * Build the rendering tree. With `tree` provided, the nodes are ingested
 * as-is (ids filled in, index built); with only `rows`, the pseudo
 * call-tree is derived by best-fit-decreasing nesting (see the header
 * comment for WHY that recovers plausible caller edges from flat data).
 */
export function buildFlameTree(source: FlameGraphSource): FlameTree | null {
    if (source.tree && source.tree.length > 0) {
        return ingestTree(source.tree);
    }
    const rows = source.rows;
    if (!rows || rows.length === 0) return null;
    return treeFromRows(rows);
}

/** Ingest a real call tree: normalize ids, index, compute totals. */
function ingestTree(roots: FlameNode[]): FlameTree {
    const keyMap = new WeakMap<FlameNode, string>();
    const byKey = new Map<string, FlameEntry>();
    let seq = 0;
    let frameCount = 0;
    let total = 0;

    const keyOf = (n: FlameNode): string => {
        let k = keyMap.get(n);
        if (k === undefined) {
            k = n.id ?? `n${seq++}`;
            // Guard against caller-supplied duplicate ids — keys must be
            // unique or zooming could target the wrong node.
            while (byKey.has(k)) k = `${k}~${seq++}`;
            keyMap.set(n, k);
        }
        return k;
    };

    const synthRoot: FlameNode =
        roots.length === 1
            ? roots[0]
            : {
                // Multiple roots (e.g. multi-thread samples): wrap in one
                // "<all>" frame so the canvas still has a single base row.
                name: "<all>",
                module: "<all>",
                cumulative: 0,
                children: roots,
            };

    const walk = (node: FlameNode, parent: FlameNode | null, depth: number, path: FlameNode[]): void => {
        const key = keyOf(node);
        byKey.set(key, {node, parent, depth, path: [...path, node]});
        frameCount += parent === null ? 0 : 1;
        total = Math.max(total, node.cumulative);
        for (const c of node.children ?? []) walk(c, node, depth + 1, [...path, node]);
    };
    walk(synthRoot, null, 0, []);

    return {
        root: synthRoot,
        total: total > 0 ? total : 0,
        frameCount,
        keyOf,
        byKey,
    };
}

/**
 * Derive a pseudo call tree from flat pstats rows.
 *
 * Best-fit-decreasing: rows sorted by cumulative time (desc); each row
 * nests under the already-placed frame whose remaining child capacity
 * (cum − self − Σ placed children) is the SMALLEST one that still fits
 * the row. Rationale in the file header. Frames that fit nowhere fall
 * back to the synthetic root — the layout pass scales overflows down so
 * the canvas never lies about proportions between SIBLINGS.
 */
function treeFromRows(rows: PstatsRow[]): FlameTree {
    // Parse + drop non-finite rows, keep the raw ncalls text for tooltips.
    const frames = rows
        .filter((r) => Number.isFinite(r.cumtime) && Number.isFinite(r.tottime))
        .map((r) => {
            const p = parsePstatsLocation(r.location);
            return {
                ...p,
                cum: Math.max(0, r.cumtime),
                // tottime ≤ cumtime in cProfile; clamp defensively anyway.
                self: Math.max(0, Math.min(r.tottime, r.cumtime)),
                ncallsRaw: r.ncalls,
                calls: parseNcalls(r.ncalls).total,
            };
        })
        .sort((a, b) => b.cum - a.cum || a.self - b.self);

    // The profiled run's wall time in cProfile = the largest cumulative
    // row (the entry frame, e.g. "<string>:1(<module>)").
    const total = frames.reduce((m, f) => Math.max(m, f.cum), 0);

    const root: FlameNode = {
        id: SYNTHETIC_ROOT_KEY,
        name: "<script>",
        module: "<script>",
        file: "",
        line: 0,
        cumulative: total,
        self: 0,
        calls: 1,
        children: [],
    };

    // Slots: placed frames + their remaining child capacity.
    const slots: Array<{ node: FlameNode; remaining: number }> = [
        {node: root, remaining: total},
    ];

    let seq = 0;
    for (const f of frames) {
        // Tightest fit: smallest remaining capacity that still covers f.cum.
        let best: { node: FlameNode; remaining: number } | null = null;
        for (const s of slots) {
            // +ε float guard — a "just fits" row must not be rejected.
            if (s.remaining + 1e-9 >= f.cum) {
                if (best === null || s.remaining < best.remaining) best = s;
            }
        }
        const slot = best ?? slots[0];
        const node: FlameNode = {
            id: `f${seq++}`,
            name: shortFrameName(f.name),
            module: f.module,
            file: f.file,
            line: f.line,
            cumulative: f.cum,
            self: f.self,
            calls: f.calls,
            ncallsRaw: f.ncallsRaw,
            children: [],
        };
        slot.node.children!.push(node);
        slot.remaining -= f.cum;
        slots.push({node, remaining: Math.max(0, f.cum - f.self)});
    }

    return ingestTree([root]);
}

// ── layout ──────────────────────────────────────────────────────────

/** A drawable rect (CSS pixels; the component applies devicePixelRatio). */
export interface FlameRect {
    key: string;
    depth: number;
    x: number;
    w: number;
    node: FlameNode;
    /** True for the rect the view is currently zoomed into. */
    isZoomRoot?: boolean;
    /** Members of an aggregated "(other)" bucket (node === synthetic). */
    aggregated?: FlameNode[];
}

/** Sibling ordering within each parent (the flame graph toolbar's
 *  Cumulative / Self time toggle). "cumulative" — the classic flame
 *  graph: children laid out left-to-right by cumulative share, the
 *  order the tree was ingested in. "self" — self time descending
 *  (cumulative as the tie-break) so the hottest leaves sit leftmost
 *  under every parent; widths stay proportional to CUMULATIVE time —
 *  only the order changes. */
export type FlameSortMode = "cumulative" | "self";

export interface FlameLayout {
    /** Depth-major, then x-minor — mirrors the draw order. */
    rects: FlameRect[];
    /** Number of depth rows drawn (depths 0..rows-1). */
    rows: number;
    /** Zoom key the layout was built for (null = full view). */
    zoomKey: string | null;
    /** The "% of total" denominator (true root cumulative seconds). */
    total: number;
    /** True when the stack was deeper than maxDepth — the component
     *  surfaces a "N more rows hidden" note. */
    truncated: boolean;
    /** Sibling ordering this layout was built for ("cumulative" | "self"). */
    sort: FlameSortMode;
}

export interface FlameLayoutOptions {
    /** Zoom key (from FlameTree.keyOf) — null for the full tree. */
    zoomKey?: string | null;
    /** Drawable width in CSS px. */
    width: number;
    /** Frames narrower than this merge into "(other)" buckets. */
    minFramePx?: number;
    /** Depth cap (the component derives it from the canvas height). */
    maxDepth?: number;
    /** Sibling ordering within each parent — "cumulative" (default) or
     *  "self" (self time desc). Pure re-layout of the SAME tree: no
     *  re-ingestion, no mutation, zoom keys stay valid. */
    sort?: FlameSortMode;
}

/** Default sub-pixel-merge threshold (CSS px) used by the component. */
export const DEFAULT_MIN_FRAME_PX = 4;

/**
 * Layout the tree (or the zoomed subtree) into rects.
 *
 * Width model (classic flame graph): a frame's rect width is its
 * cumulative share of its parent; the children of a node start at the
 * parent's left edge and are laid out left-to-right, so the parent's
 * remaining right side reads as its self time. Pseudo-tree overflow
 * (Σ child cumulative > parent capacity) is scaled down proportionally
 * — sibling RATIOS always stay truthful, and tooltips show the REAL
 * numbers even where the nesting itself is a heuristic.
 *
 * Tiny frames: consecutive siblings narrower than minFramePx collapse
 * into one "(other)" rect spanning their combined range (its tooltip
 * lists the members). Deep stacks: recursion stops at maxDepth.
 */
export function layoutFlame(
    tree: FlameTree,
    opts: FlameLayoutOptions
): FlameLayout {
    // NOTE: the layout is rowHeight-agnostic — depths are row indices and
    // x/w are CSS px; the component maps depth→y (depth·rowHeight) and
    // hitTestFlame maps y→depth the same way, so the row height can differ
    // between renders without re-deriving anything.
    const width = Math.max(1, opts.width);
    const minPx = Math.max(0, opts.minFramePx ?? DEFAULT_MIN_FRAME_PX);
    const maxDepth = Math.max(1, opts.maxDepth ?? 64);
    const sort: FlameSortMode = opts.sort ?? "cumulative";

    const rects: FlameRect[] = [];
    let rows = 0;
    let truncated = false;

    const zoomKey = opts.zoomKey ?? null;
    const zoomEntry = zoomKey ? tree.byKey.get(zoomKey) ?? null : null;
    const viewRoot: FlameNode = zoomEntry ? zoomEntry.node : tree.root;
    // Percent base is ALWAYS the true root — zooming must not silently
    // redefine "total" in the tooltip.
    const total = tree.total > 0 ? tree.total : viewRoot.cumulative;

    // ── sibling ordering (the toolbar's Cumulative / Self toggle) ──
    // "self" orders every parent's children by self time descending
    // (cumulative desc as the tie-break) through a per-layout WeakMap,
    // so the SHARED tree is never mutated — toggling back to
    // "cumulative" is a fresh layout over the untouched children arrays,
    // and zoom keys / the byKey index stay valid across modes (clicking
    // a frame keeps zooming in either mode).
    const selfTime = (n: FlameNode): number => {
        const s = n.self ?? 0;
        return Number.isFinite(s) ? s : 0;
    };
    const cumTime = (n: FlameNode): number =>
        Number.isFinite(n.cumulative) ? n.cumulative : 0;
    const orderCache =
        sort === "self" ? new WeakMap<FlameNode, FlameNode[]>() : null;
    const childrenOf = (node: FlameNode): FlameNode[] => {
        const kids = node.children;
        if (!kids || kids.length === 0) return kids ?? [];
        if (!orderCache) return kids;
        let sorted = orderCache.get(node);
        if (!sorted) {
            sorted = [...kids].sort(
                (a, b) => selfTime(b) - selfTime(a) || cumTime(b) - cumTime(a)
            );
            orderCache.set(node, sorted);
        }
        return sorted;
    };

    const place = (node: FlameNode, depth: number, x: number, w: number): void => {
        const key = tree.keyOf(node);
        const isZoomRoot = zoomEntry !== null && node === viewRoot;
        rects.push({key, depth, x, w, node, isZoomRoot: isZoomRoot || undefined});
        rows = Math.max(rows, depth + 1);

        const children = childrenOf(node);
        if (!children || children.length === 0) return;
        if (depth + 1 >= maxDepth) {
            truncated = true; // stack continues below the canvas — say so
            return;
        }
        // Sub-pixel frames cannot host readable children — skip recursion
        // (their aggregation already reported them via minFramePx above).
        if (w < 1) return;

        // Child pixel budget: the parent's rect minus its own self slice.
        const cumW = node.cumulative > 0 ? node.cumulative : 1;
        const childShare = clamp01((node.cumulative - (node.self ?? 0)) / cumW);
        const budget = w * childShare;

        // Child widths ∝ cumulative time. Degenerate zero-time parents get
        // an equal split so the row is still visible.
        const sumCum = children.reduce((s, c) => s + Math.max(0, c.cumulative), 0);
        const childW: number[] =
            sumCum > 0
                ? children.map((c) => (Math.max(0, c.cumulative) / cumW) * w)
                : children.map(() => w / children.length);

        // Scale down ONLY on overflow (Σ > budget) — never scale up, which
        // would fabricate proportions between siblings.
        const sumW = childW.reduce((s, v) => s + v, 0);
        const scale = sumW > budget + 1e-9 && sumW > 0 ? budget / sumW : 1;
        if (scale !== 1) childW.forEach((_, i) => (childW[i] = childW[i] * scale));

        // Walk children; runs of sub-minFramePx siblings collapse into an
        // "(other)" bucket rect (consecutive by construction — flame rows
        // are laid out left-to-right, so a run spans a contiguous range).
        let cx = x;
        let bucketStart = -1;
        let bucketX = 0;
        let bucketW = 0;
        const bucketMembers: FlameNode[] = [];

        const flushBucket = (): void => {
            if (bucketStart < 0) return;
            rects.push({
                key: `${key}~o${bucketStart}`,
                depth: depth + 1,
                x: bucketX,
                w: bucketW,
                node: OTHER_NODE,
                aggregated: bucketMembers.slice(),
            });
            rows = Math.max(rows, depth + 2);
            bucketStart = -1;
            bucketW = 0;
            bucketMembers.length = 0;
        };

        for (let i = 0; i < children.length; i++) {
            const cw = childW[i];
            if (cw < minPx) {
                if (bucketStart < 0) {
                    bucketStart = i;
                    bucketX = cx;
                }
                bucketW += Math.max(cw, 0);
                bucketMembers.push(children[i]);
                cx += Math.max(cw, 0);
                continue;
            }
            flushBucket();
            place(children[i], depth + 1, cx, cw);
            cx += cw;
        }
        flushBucket();
    };

    place(viewRoot, 0, 0, width);

    return {rects, rows, zoomKey, total, truncated, sort};
}

/** The synthetic node used for "(other)" aggregation buckets. */
const OTHER_NODE: FlameNode = {
    id: "__other__",
    name: "(other)",
    module: "(other)",
    cumulative: 0,
    self: 0,
};

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── colors ───────────────────────────────────────────────────────────

/** Warm flame-graph hues (red → orange → amber → yellow). No blue/indigo. */
const WARM_HUES = [4, 14, 24, 34, 44, 54, 64, 74];

/**
 * Stable module color: FNV-1a hash → warm hue + saturation/lightness
 * jitter. Same module name ⇒ same color across renders and zoom states
 * (a Map in the component caches the string so the hot draw loop only
 * ever does a lookup).
 */
export function flameColorsFor(module: string): {
    fill: string;
    stroke: string;
    text: string;
} {
    if (module === "(other)") {
        // Neutral gray for merged sub-pixel frames — must not read as a
        // module color (it isn't one).
        return {fill: "hsl(30, 6%, 62%)", stroke: "hsl(30, 6%, 46%)", text: "rgba(20, 20, 18, 0.92)"};
    }
    if (module === "<script>" || module === "<all>") {
        // Neutral warm gray for the synthetic root — it carries no cost of
        // its own, so a saturated color would overstate it.
        return {fill: "hsl(30, 10%, 58%)", stroke: "hsl(30, 10%, 42%)", text: "rgba(20, 20, 18, 0.92)"};
    }
    const h = fnv1a(module);
    const hue = WARM_HUES[h % WARM_HUES.length];
    const sat = 62 + ((h >>> 3) % 18);
    const light = 52 + ((h >>> 7) % 10);
    return {
        fill: `hsl(${hue}, ${sat}%, ${light}%)`,
        stroke: `hsl(${hue}, ${sat}%, ${Math.max(30, light - 14)}%)`,
        text: "rgba(22, 20, 18, 0.92)",
    };
}

/** FNV-1a 32-bit string hash (stable, tiny, dependency-free). */
export function fnv1a(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// ── hit testing ──────────────────────────────────────────────────────

/**
 * Rect under a pointer (CSS px, canvas-relative). Depth is derived from
 * the y row first so the scan can skip other rows; overlapping rects
 * (only possible in degenerate scaled pseudo-trees) resolve to the
 * widest one — the visually dominant frame.
 */
export function hitTestFlame(
    rects: FlameRect[],
    px: number,
    py: number,
    rowHeight: number
): FlameRect | null {
    const depth = Math.floor(py / rowHeight);
    let best: FlameRect | null = null;
    for (const r of rects) {
        if (r.depth !== depth) continue;
        if (px >= r.x && px < r.x + Math.max(r.w, 1)) {
            if (best === null || r.w > best.w) best = r;
        }
    }
    return best;
}

// ── formatting ───────────────────────────────────────────────────────

/** Adaptive seconds: 834 µs / 12.34 ms / 1.234 s (3 significant-ish). */
export function formatSeconds(s: number): string {
    if (!Number.isFinite(s)) return "—";
    if (s === 0) return "0 s";
    if (s >= 1) return `${s.toFixed(3)} s`;
    if (s >= 0.001) return `${(s * 1000).toFixed(2)} ms`;
    return `${(s * 1_000_000).toFixed(0)} µs`;
}

/** "42.1%" of `total` — guards divide-by-zero (degenerate profiles). */
export function percentOf(value: number, total: number): string {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return "0.0%";
    return `${((value / total) * 100).toFixed(1)}%`;
}

// ── breadcrumbs path helper ─────────────────────────────────────────

/**
 * Root→node path (inclusive) for the zoom breadcrumb row. Returns []
 * when key is unknown (stale zoom after the tree changed).
 */
export function flamePathTo(tree: FlameTree, key: string | null): FlameNode[] {
    if (!key) return [];
    return tree.byKey.get(key)?.path ?? [];
}
