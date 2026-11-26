/**
 * workspace-session — the F5-survival snapshot.
 *
 * Open tabs and their order already persisted to localStorage, but
 * dirty buffers, the split-pane layout, caret/scroll positions,
 * terminal sessions (the SERVER keeps them alive across reloads —
 * only the client forgot their ids) and the console kernel all
 * vanished on every refresh. This module is the single debounced
 * snapshot those pieces read from / write to.
 *
 * Newer optional fields (absent in older snapshots — the typed
 * readBottomPanel/readSplitWidths helpers return null for those, so
 * the page keeps its defaults): `bottomPanel` (open/activeTab/height)
 * and `splitWidths` (horizontal + vertical split ratios and the
 * right-rail width).
 *
 * Storage: localStorage "praxis.session" — small, JSON;
 * entries with a stale version are dropped wholesale.
 */

export interface EditorTabSnapshot {
    folderSlug: string;
    fileSlug: string;
    name: string;
    kind: string;
}

export interface DirtyBufferSnapshot {
    content: string;
    caret: number;
    /** The viewport's scrollTop — round-trips on restore so a reload
     *  lands on the exact position (older snapshots simply lack it). */
    scrollTop?: number;
    savedAt: number;
}

export interface TerminalSessionSnapshot {
    id: string;
    kind: "shell" | "python";
    cwd: string;
    shell: string;
}

export interface SplitTargetSnapshot {
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    folderName: string;
}

export interface SplitPaneSnapshot {
    open: boolean;
    orientation: "right" | "down";
    targets: SplitTargetSnapshot[];
    /** Per-pane shares of the pane GROUP, in percent (sums to ~100) —
     *  written by the Round 3 multi-pane gutter drag. Absent in older
     *  snapshots (and on length mismatch) → the page falls back to equal
     *  shares. */
    sizes?: number[];
}

/**
 * Bottom-panel state — open/tab/height so a reload lands back on the
 * same view (Output / Terminal / Console…), at the same size. `height`
 * is the PANEL's share of the vertical split in PERCENT (5–95);
 * the page stores the complementary code-pane ratio, so wiring is
 * `height: 100 - codePanelHeight` on save and
 * `setCodePanelHeight(100 - height)` on restore. `activeTab` is the
 * page's bottom-tab id ("output" | "terminal" | …) — kept a plain
 * string here so this module never imports page-level unions.
 */
export interface BottomPanelSnapshot {
    open: boolean;
    activeTab: string;
    /** Bottom panel's share of the vertical split, in percent (5–95). */
    height: number;
}

/**
 * Split-pane width ratios + the right-rail width. The split editor's
 * ratio is stored BOTH ways because the same `splitPaneWidthPercent`
 * state drives a horizontal (orientation "right") or vertical
 * (orientation "down") split — persisting both lets a flip of the
 * orientation keep each layout's last size. `rightRailWidth` is the
 * right dock (AI chat sheet) width in px — fixed 400 today, stored so
 * a future resizable rail already round-trips.
 */
export interface SplitWidthsSnapshot {
    /** Side-by-side split ratio (0.1–0.9; main pane's width share). */
    horizontalRatio: number;
    /** Stacked split ratio (0.1–0.9; top pane's height share). */
    verticalRatio: number;
    /** Right rail (AI chat dock) width in px (160–800; default 400). */
    rightRailWidth: number;
}

export interface WorkspaceSession {
    version: 1;
    openTabs: EditorTabSnapshot[];
    activeTab: { folderSlug: string; fileSlug: string } | null;
    /** Split-pane layout (null = whatever the page default is). */
    splitPane: SplitPaneSnapshot | null;
    /** Bottom-panel state (null/missing in older snapshots — the page
     *  then keeps its default open/tab/height). */
    bottomPanel?: BottomPanelSnapshot | null;
    /** Split widths + right-rail width (null/missing in older snapshots). */
    splitWidths?: SplitWidthsSnapshot | null;
    /** Unsaved buffers keyed by "folderSlug/fileSlug" (size-capped). */
    dirtyBuffers: Record<string, DirtyBufferSnapshot>;
    /** Live server terminal session ids (validated on restore). */
    terminalSessions: TerminalSessionSnapshot[];
    consoleSessionId: string | null;
    savedAt: number;
}

const KEY = "praxis.session";
// One-time migration from the older key (state is preserved).
const LEGACY_KEY = "praxis.session.v1";

/** Max persisted dirty buffers (LRU by savedAt when over cap). */
const MAX_DIRTY = 12;
/** Max bytes of a single dirty buffer worth persisting (~256 KB). */
const MAX_DIRTY_BYTES = 262_144;
/** Drop dirty buffers older than 3 days (stale beyond saving). */
const DIRTY_TTL_MS = 3 * 24 * 60 * 60 * 1000;

// ─── bottom-panel + split-width validation (see the interfaces above) ──
/** Bottom-panel share of the vertical split, percent (page default 45
 *  = the complement of the historical codePanelHeight 55). */
const BOTTOM_HEIGHT_MIN = 5;
const BOTTOM_HEIGHT_MAX = 95;
const BOTTOM_HEIGHT_DEFAULT = 45;
const BOTTOM_TAB_MAX_LEN = 32;
const SPLIT_RATIO_MIN = 0.1;
const SPLIT_RATIO_MAX = 0.9;
const SPLIT_RATIO_DEFAULT = 0.5;
const RIGHT_RAIL_MIN_PX = 160;
const RIGHT_RAIL_MAX_PX = 800;
const RIGHT_RAIL_DEFAULT_PX = 400;

const clamp = (v: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, v));

/**
 * Sanitize a raw bottom-panel block. Tolerant like the loader itself:
 * a missing/invalid `height` falls back to the page default, but a
 * non-boolean `open` or a bogus `activeTab` drops the whole block —
 * half-restored UI state is worse than none.
 */
function sanitizeBottomPanel(raw: unknown): BottomPanelSnapshot | null {
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Partial<BottomPanelSnapshot>;
    if (typeof p.open !== "boolean") return null;
    if (
        typeof p.activeTab !== "string" ||
        p.activeTab.length === 0 ||
        p.activeTab.length > BOTTOM_TAB_MAX_LEN
    ) {
        return null;
    }
    const height =
        typeof p.height === "number" && Number.isFinite(p.height)
            ? clamp(p.height, BOTTOM_HEIGHT_MIN, BOTTOM_HEIGHT_MAX)
            : BOTTOM_HEIGHT_DEFAULT;
    return {open: p.open, activeTab: p.activeTab, height};
}

/**
 * Sanitize raw split widths. Each ratio/width is clamped into its
 * documented range; a completely absent block returns null (older
 * snapshot — the page keeps its defaults).
 */
function sanitizeSplitWidths(raw: unknown): SplitWidthsSnapshot | null {
    if (!raw || typeof raw !== "object") return null;
    const w = raw as Partial<SplitWidthsSnapshot>;
    const ratio = (v: unknown): number =>
        typeof v === "number" && Number.isFinite(v)
            ? clamp(v, SPLIT_RATIO_MIN, SPLIT_RATIO_MAX)
            : SPLIT_RATIO_DEFAULT;
    const rail =
        typeof w.rightRailWidth === "number" && Number.isFinite(w.rightRailWidth)
            ? clamp(w.rightRailWidth, RIGHT_RAIL_MIN_PX, RIGHT_RAIL_MAX_PX)
            : RIGHT_RAIL_DEFAULT_PX;
    return {
        horizontalRatio: ratio(w.horizontalRatio),
        verticalRatio: ratio(w.verticalRatio),
        rightRailWidth: rail,
    };
}

export function emptyWorkspaceSession(): WorkspaceSession {
    return {
        version: 1,
        openTabs: [],
        activeTab: null,
        splitPane: null,
        bottomPanel: null,
        splitWidths: null,
        dirtyBuffers: {},
        terminalSessions: [],
        consoleSessionId: null,
        savedAt: 0,
    };
}

export function loadWorkspaceSession(): WorkspaceSession | null {
    if (typeof window === "undefined") return null;
    try {
        let raw = window.localStorage.getItem(KEY);
        if (!raw) {
            raw = window.localStorage.getItem(LEGACY_KEY);
            if (raw) window.localStorage.setItem(KEY, raw);
        }
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<WorkspaceSession>;
        if (parsed.version !== 1) return null;
        const now = Date.now();
        const dirty: Record<string, DirtyBufferSnapshot> = {};
        if (parsed.dirtyBuffers && typeof parsed.dirtyBuffers === "object") {
            for (const [k, v] of Object.entries(parsed.dirtyBuffers)) {
                if (!v || typeof v.content !== "string") continue;
                if (v.content.length > MAX_DIRTY_BYTES) continue;
                if (typeof v.savedAt === "number" && now - v.savedAt > DIRTY_TTL_MS) continue;
                dirty[k] = {content: v.content, caret: v.caret ?? 0, savedAt: v.savedAt ?? now};
            }
        }
        return {
            version: 1,
            openTabs: Array.isArray(parsed.openTabs)
                ? parsed.openTabs.filter(
                    (t) => t && typeof t.folderSlug === "string" && typeof t.fileSlug === "string"
                )
                : [],
            activeTab:
                parsed.activeTab && parsed.activeTab.folderSlug && parsed.activeTab.fileSlug
                    ? parsed.activeTab
                    : null,
            splitPane:
                parsed.splitPane && Array.isArray(parsed.splitPane.targets)
                    ? {
                        open: !!parsed.splitPane.open,
                        orientation: parsed.splitPane.orientation === "down" ? "down" : "right",
                        targets: parsed.splitPane.targets.filter(
                            (t) => t && typeof t.folderSlug === "string" && typeof t.fileSlug === "string"
                        ),
                        /* Round 3 — keep the persisted per-pane shares ONLY as
                           sanitized sane numbers; the page additionally drops
                           them on a length mismatch with the surviving targets
                           and rebuilds equal shares. */
                        sizes: Array.isArray(parsed.splitPane.sizes)
                            ? parsed.splitPane.sizes.filter(
                                (v) => typeof v === "number" && Number.isFinite(v) && v > 0 && v < 100
                            )
                            : undefined,
                    }
                    : null,
            // Newer fields — absent in older snapshots, so undefined → null
            // keeps the restored shape total (no "missing" reads downstream).
            bottomPanel: sanitizeBottomPanel(parsed.bottomPanel),
            splitWidths: sanitizeSplitWidths(parsed.splitWidths),
            dirtyBuffers: dirty,
            terminalSessions: Array.isArray(parsed.terminalSessions)
                ? parsed.terminalSessions.filter(
                    (t) => t && typeof t.id === "string" && (t.kind === "shell" || t.kind === "python")
                )
                : [],
            consoleSessionId:
                typeof parsed.consoleSessionId === "string" ? parsed.consoleSessionId : null,
            savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
        };
    } catch {
        return null;
    }
}

// ─── typed accessors for the newer optional fields ──────────────────
// Older snapshots lack bottomPanel / splitWidths (and page-level code
// still builds sessions without them), so every read goes through
// these helpers — callers never null-dig by hand, never see a partial
// block — and every write re-sanitizes so a bogus value can never
// reach localStorage.

/** Bottom-panel state from a session (null when the snapshot predates
 *  the field — callers then keep their page defaults). */
export function readBottomPanel(
    session: WorkspaceSession | null | undefined
): BottomPanelSnapshot | null {
    return session ? sanitizeBottomPanel(session.bottomPanel) : null;
}

/** Split widths + right-rail width from a session (null when absent). */
export function readSplitWidths(
    session: WorkspaceSession | null | undefined
): SplitWidthsSnapshot | null {
    return session ? sanitizeSplitWidths(session.splitWidths) : null;
}

/** New session with the bottom-panel state replaced (immutably —
 *  callers hand the result to saveWorkspaceSession as usual). */
export function withBottomPanel(
    session: WorkspaceSession,
    panel: BottomPanelSnapshot | null
): WorkspaceSession {
    return {...session, bottomPanel: panel ? sanitizeBottomPanel(panel) : null};
}

/** New session with the split widths replaced (immutably). */
export function withSplitWidths(
    session: WorkspaceSession,
    widths: SplitWidthsSnapshot | null
): WorkspaceSession {
    return {...session, splitWidths: widths ? sanitizeSplitWidths(widths) : null};
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pending: WorkspaceSession | null = null;

export function saveWorkspaceSession(session: WorkspaceSession, debounceMs = 500): void {
    if (typeof window === "undefined") return;
    pending = {...session, savedAt: Date.now()};
    if (debounceMs === 0) {
        if (writeTimer) clearTimeout(writeTimer);
        writeTimer = null;
        flushWorkspaceSession();
        return;
    }
    if (writeTimer) return;
    writeTimer = setTimeout(() => {
        writeTimer = null;
        flushWorkspaceSession();
    }, debounceMs);
}

export function flushWorkspaceSession(): void {
    if (typeof window === "undefined" || !pending) return;
    const session = pending;
    pending = null;
    try {
        // Cap the dirty-buffer map by recency before writing.
        const entries = Object.entries(session.dirtyBuffers);
        if (entries.length > MAX_DIRTY) {
            entries.sort((a, b) => (a[1].savedAt ?? 0) - (b[1].savedAt ?? 0));
            for (const [k] of entries.slice(0, entries.length - MAX_DIRTY)) {
                delete session.dirtyBuffers[k];
            }
        }
        window.localStorage.setItem(KEY, JSON.stringify(session));
    } catch {
        // Quota exceeded — drop the dirty buffers (biggest payload) and
        // retry once so at least the tabs survive.
        try {
            window.localStorage.setItem(
                KEY,
                JSON.stringify({...session, dirtyBuffers: {}})
            );
        } catch {
            /* give up silently */
        }
    }
}

export function clearWorkspaceSession(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }
}

if (typeof window !== "undefined") {
    // Never lose a pending snapshot to a hard close.
    window.addEventListener("beforeunload", () => {
        if (writeTimer) {
            clearTimeout(writeTimer);
            writeTimer = null;
        }
        flushWorkspaceSession();
    });
}
