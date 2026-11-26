/**
 * workspace-session.test.ts — unit tests for the F5-survival snapshot
 * (src/lib/workspace-session.ts), focused on the newer optional fields:
 *
 *   ▸ bottomPanel {open, activeTab, height} — round-trips through
 *     save/load, clamps out-of-range heights, and drops blocks whose
 *     open/activeTab are unusable instead of half-restoring them.
 *   ▸ splitWidths {horizontalRatio, verticalRatio, rightRailWidth} —
 *     same contract: clamp each number into its documented range.
 *   ▸ Backward compatibility — snapshots written before the fields
 *     existed (they are simply absent) load with null, and the typed
 *     readers return null so the page keeps its defaults.
 *   ▸ The with* writers are immutable and re-sanitize their input.
 *
 * Pure localStorage logic — plain node vitest environment with a
 * stubbed window.localStorage (same pattern as fold-state.test.ts).
 */
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    clearWorkspaceSession,
    emptyWorkspaceSession,
    flushWorkspaceSession,
    loadWorkspaceSession,
    readBottomPanel,
    readSplitWidths,
    saveWorkspaceSession,
    withBottomPanel,
    withSplitWidths,
    type WorkspaceSession,
} from "@/lib/workspace-session";

function makeLocalStorage(): Storage {
    const store = new Map<string, string>();
    return {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() {
            return store.size;
        },
    };
}

let storage: Storage;

beforeEach(() => {
    storage = makeLocalStorage();
    vi.stubGlobal("window", {localStorage: storage});
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const base = (): WorkspaceSession => emptyWorkspaceSession();

describe("bottomPanel — round-trip + backward compatibility", () => {
    it("round-trips open/activeTab/height through save → load", () => {
        const snap = withBottomPanel(base(), {open: true, activeTab: "terminal", height: 38});
        saveWorkspaceSession(snap, 0);
        const loaded = loadWorkspaceSession();
        expect(loaded?.bottomPanel).toEqual({open: true, activeTab: "terminal", height: 38});
        expect(readBottomPanel(loaded)).toEqual({open: true, activeTab: "terminal", height: 38});
    });

    it("returns null for older snapshots that lack the field", () => {
        storage.setItem(
            "praxis.session",
            JSON.stringify({
                version: 1,
                openTabs: [],
                activeTab: null,
                splitPane: null,
                dirtyBuffers: {},
                terminalSessions: [],
                consoleSessionId: null,
                savedAt: Date.now(),
            })
        );
        const loaded = loadWorkspaceSession();
        expect(loaded).not.toBeNull();
        expect(loaded?.bottomPanel ?? null).toBeNull();
        expect(loaded?.splitWidths ?? null).toBeNull();
        expect(readBottomPanel(loaded)).toBeNull();
        expect(readSplitWidths(loaded)).toBeNull();
    });

    it("emptyWorkspaceSession carries the new fields as explicit nulls", () => {
        expect(base().bottomPanel).toBeNull();
        expect(base().splitWidths).toBeNull();
    });

    it("clamps out-of-range heights into the 5–95 band", () => {
        expect(readBottomPanel(withBottomPanel(base(), {open: true, activeTab: "output", height: 3})))
            .toEqual({open: true, activeTab: "output", height: 5});
        expect(readBottomPanel(withBottomPanel(base(), {open: true, activeTab: "output", height: 120})))
            .toEqual({open: true, activeTab: "output", height: 95});
    });

    it("falls back to the default height when height is missing or non-finite", () => {
        // Missing height: simulate a partially-written block by round-tripping
        // raw JSON (the loader is the tolerance boundary for raw storage).
        storage.setItem(
            "praxis.session",
            JSON.stringify({
                version: 1,
                openTabs: [],
                activeTab: null,
                splitPane: null,
                bottomPanel: {open: true, activeTab: "console"},
                dirtyBuffers: {},
                terminalSessions: [],
                consoleSessionId: null,
                savedAt: Date.now(),
            })
        );
        expect(loadWorkspaceSession()?.bottomPanel).toEqual({
            open: true,
            activeTab: "console",
            height: 45,
        });
        // Non-finite height through the writer → clamped by sanitize, not NaN.
        const bad = withBottomPanel(base(), {
            open: true,
            activeTab: "console",
            height: Number.NaN,
        });
        expect(readBottomPanel(bad)?.height).toBe(45);
    });

    it("drops the whole block when open or activeTab is unusable", () => {
        storage.setItem(
            "praxis.session",
            JSON.stringify({
                version: 1,
                openTabs: [],
                activeTab: null,
                splitPane: null,
                bottomPanel: {open: "yes", activeTab: "output", height: 40},
                dirtyBuffers: {},
                terminalSessions: [],
                consoleSessionId: null,
                savedAt: Date.now(),
            })
        );
        expect(loadWorkspaceSession()?.bottomPanel ?? null).toBeNull();

        storage.setItem(
            "praxis.session",
            JSON.stringify({
                version: 1,
                openTabs: [],
                activeTab: null,
                splitPane: null,
                bottomPanel: {open: true, activeTab: "", height: 40},
                dirtyBuffers: {},
                terminalSessions: [],
                consoleSessionId: null,
                savedAt: Date.now(),
            })
        );
        expect(loadWorkspaceSession()?.bottomPanel ?? null).toBeNull();
    });
});

describe("splitWidths — clamp + persistence", () => {
    it("round-trips all three numbers", () => {
        const snap = withSplitWidths(base(), {
            horizontalRatio: 0.62,
            verticalRatio: 0.45,
            rightRailWidth: 420,
        });
        saveWorkspaceSession(snap, 0);
        expect(loadWorkspaceSession()?.splitWidths).toEqual({
            horizontalRatio: 0.62,
            verticalRatio: 0.45,
            rightRailWidth: 420,
        });
    });

    it("clamps ratios to 0.1–0.9 and the rail to 160–800 px", () => {
        const clamped = readSplitWidths(
            withSplitWidths(base(), {
                horizontalRatio: 0.02,
                verticalRatio: 1.4,
                rightRailWidth: 50,
            })
        );
        expect(clamped).toEqual({horizontalRatio: 0.1, verticalRatio: 0.9, rightRailWidth: 160});

        expect(
            readSplitWidths(
                withSplitWidths(base(), {
                    horizontalRatio: 0.5,
                    verticalRatio: 0.5,
                    rightRailWidth: 4000,
                })
            )
        ).toEqual({horizontalRatio: 0.5, verticalRatio: 0.5, rightRailWidth: 800});
    });

    it("fills defaults for partially-present raw blocks (loader tolerance)", () => {
        storage.setItem(
            "praxis.session",
            JSON.stringify({
                version: 1,
                openTabs: [],
                activeTab: null,
                splitPane: null,
                splitWidths: {horizontalRatio: 0.7},
                dirtyBuffers: {},
                terminalSessions: [],
                consoleSessionId: null,
                savedAt: Date.now(),
            })
        );
        expect(loadWorkspaceSession()?.splitWidths).toEqual({
            horizontalRatio: 0.7,
            verticalRatio: 0.5,
            rightRailWidth: 400,
        });
    });

    it("keeps the rest of the snapshot when the raw block is garbage", () => {
        storage.setItem(
            "praxis.session",
            JSON.stringify({
                version: 1,
                openTabs: [{folderSlug: "f", fileSlug: "a-py", name: "a.py", kind: "python"}],
                activeTab: {folderSlug: "f", fileSlug: "a-py"},
                splitPane: null,
                splitWidths: "not-an-object",
                dirtyBuffers: {},
                terminalSessions: [],
                consoleSessionId: null,
                savedAt: Date.now(),
            })
        );
        const loaded = loadWorkspaceSession();
        expect(loaded?.openTabs).toHaveLength(1);
        expect(loaded?.splitWidths ?? null).toBeNull();
    });
});

describe("typed helpers", () => {
    it("read* tolerate null/undefined sessions", () => {
        expect(readBottomPanel(null)).toBeNull();
        expect(readBottomPanel(undefined)).toBeNull();
        expect(readSplitWidths(null)).toBeNull();
        expect(readSplitWidths(undefined)).toBeNull();
    });

    it("read* return null for session objects built without the fields", () => {
        // page.tsx still constructs sessions inline without the new fields.
        const legacy: WorkspaceSession = {
            version: 1,
            openTabs: [],
            activeTab: null,
            splitPane: null,
            dirtyBuffers: {},
            terminalSessions: [],
            consoleSessionId: null,
            savedAt: 0,
        };
        expect(readBottomPanel(legacy)).toBeNull();
        expect(readSplitWidths(legacy)).toBeNull();
    });

    it("with* are immutable and clear with null", () => {
        const before = withBottomPanel(base(), {open: true, activeTab: "output", height: 40});
        const after = withBottomPanel(before, null);
        expect(before.bottomPanel).not.toBeNull();
        expect(after.bottomPanel).toBeNull();
        // Original session untouched (callers chain snapshots without clones).
        const widthsBefore = withSplitWidths(base(), {
            horizontalRatio: 0.5,
            verticalRatio: 0.5,
            rightRailWidth: 400,
        });
        const widthsAfter = withSplitWidths(widthsBefore, null);
        expect(widthsAfter.splitWidths).toBeNull();
        expect(widthsBefore.splitWidths).not.toBeNull();
        expect(after.openTabs).toEqual(before.openTabs);
    });
});

describe("save/load plumbing with the new fields (regression)", () => {
    it("debounced pending write flushes both new fields", () => {
        const snap = withSplitWidths(
            withBottomPanel(base(), {open: false, activeTab: "output", height: 55}),
            {horizontalRatio: 0.66, verticalRatio: 0.5, rightRailWidth: 400}
        );
        saveWorkspaceSession(snap, 500); // queued, not written yet
        flushWorkspaceSession();
        const loaded = loadWorkspaceSession();
        expect(loaded?.bottomPanel).toEqual({open: false, activeTab: "output", height: 55});
        expect(loaded?.splitWidths?.horizontalRatio).toBe(0.66);
    });

    it("clearWorkspaceSession wipes the stored snapshot", () => {
        saveWorkspaceSession(withBottomPanel(base(), {open: true, activeTab: "output", height: 40}), 0);
        clearWorkspaceSession();
        expect(loadWorkspaceSession()).toBeNull();
    });

    it("loadWorkspaceSession degrades to null on malformed JSON", () => {
        storage.setItem("praxis.session", "{not json");
        expect(loadWorkspaceSession()).toBeNull();
    });
});
