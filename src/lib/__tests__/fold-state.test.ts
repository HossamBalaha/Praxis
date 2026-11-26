/**
 * fold-state.test.ts — unit tests for the persisted fold-state helpers
 * (src/lib/fold-state.ts) behind the "folds survive reload" feature.
 *
 * Covered contracts:
 * - loadFoldState degrades to {} on missing/malformed/non-object storage
 *   and drops corrupted entries instead of failing the whole map.
 * - restoreFoldKeys returns the saved array (or [] when unknown).
 * - saveFoldState round-trips, persists explicit empty entries, bumps
 *   recency (delete + re-insert) and LRU-trims at 50 files.
 * - clearFoldState removes exactly one entry.
 * - SSR guard: no window → no-ops, never throws.
 *
 * Pure localStorage logic — plain node vitest environment with a
 * stubbed window.localStorage.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    clearFoldState,
    FOLD_STATE_MAX_FILES,
    FOLD_STATE_STORAGE_KEY,
    loadFoldState,
    restoreFoldKeys,
    saveFoldState,
} from "@/lib/fold-state";

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

describe("loadFoldState", () => {
    it("returns {} when nothing is stored", () => {
        expect(loadFoldState()).toEqual({});
    });

    it("round-trips what saveFoldState wrote", () => {
        saveFoldState("f/a.py", ["def:foo", "class:Bar#12"]);
        expect(loadFoldState()).toEqual({"f/a.py": ["def:foo", "class:Bar#12"]});
        expect(restoreFoldKeys("f/a.py")).toEqual(["def:foo", "class:Bar#12"]);
    });

    it("degrades to {} on malformed JSON", () => {
        storage.setItem(FOLD_STATE_STORAGE_KEY, "{not json");
        expect(loadFoldState()).toEqual({});
    });

    it("degrades to {} when the stored value is not an object", () => {
        storage.setItem(FOLD_STATE_STORAGE_KEY, "[1,2,3]");
        expect(loadFoldState()).toEqual({});
        storage.setItem(FOLD_STATE_STORAGE_KEY, '"a string"');
        expect(loadFoldState()).toEqual({});
    });

    it("drops corrupted per-file entries but keeps valid ones", () => {
        storage.setItem(
            FOLD_STATE_STORAGE_KEY,
            JSON.stringify({
                "f/good.py": ["def:ok"],
                "f/bad.py": "not-an-array",
                "f/mixed.py": ["def:ok", 42, null, ""],
                "": ["def:orphan"],
            })
        );
        const map = loadFoldState();
        expect(map["f/good.py"]).toEqual(["def:ok"]);
        expect(map["f/bad.py"]).toBeUndefined();
        // Non-string / empty entries are filtered out of the mixed entry.
        expect(map["f/mixed.py"]).toEqual(["def:ok"]);
        expect(Object.keys(map)).not.toContain("");
    });
});

describe("restoreFoldKeys", () => {
    it("returns [] for an unknown file id", () => {
        expect(restoreFoldKeys("f/never-seen.py")).toEqual([]);
        expect(restoreFoldKeys("")).toEqual([]);
    });
});

describe("saveFoldState", () => {
    it("writes under the exact storage key", () => {
        saveFoldState("f/a.py", ["def:foo"]);
        const raw = storage.getItem(FOLD_STATE_STORAGE_KEY);
        expect(raw).not.toBeNull();
        expect(JSON.parse(raw!)).toEqual({"f/a.py": ["def:foo"]});
    });

    it("persists an explicit empty entry (user unfolded everything)", () => {
        saveFoldState("f/a.py", ["def:foo"]);
        saveFoldState("f/a.py", []);
        expect(restoreFoldKeys("f/a.py")).toEqual([]);
    });

    it("bumps recency: re-saving an existing file moves it to the end", () => {
        saveFoldState("f/old.py", ["def:old"]);
        saveFoldState("f/new.py", ["def:new"]);
        saveFoldState("f/old.py", ["def:old-again"]);
        // Insertion order after the recency bump: new.py, old.py.
        expect(Object.keys(loadFoldState())).toEqual(["f/new.py", "f/old.py"]);
        expect(restoreFoldKeys("f/old.py")).toEqual(["def:old-again"]);
    });

    it("LRU-trims beyond the cap, dropping the least recently written first", () => {
        for (let i = 0; i < FOLD_STATE_MAX_FILES + 5; i++) {
            saveFoldState(`f/file${i}.py`, [`def:f${i}`]);
        }
        const keys = Object.keys(loadFoldState());
        expect(keys.length).toBe(FOLD_STATE_MAX_FILES);
        // The five oldest were dropped…
        expect(keys).not.toContain("f/file0.py");
        expect(keys).not.toContain("f/file4.py");
        // …the newest survived…
        expect(keys).toContain(`f/file${FOLD_STATE_MAX_FILES + 4}.py`);
        // …and the survivors keep the saved folds.
        expect(restoreFoldKeys(`f/file${FOLD_STATE_MAX_FILES + 4}.py`)).toEqual([
            `def:f${FOLD_STATE_MAX_FILES + 4}`,
        ]);
    });

    it("keeps a touched file alive through the recency bump when trimming", () => {
        for (let i = 0; i < FOLD_STATE_MAX_FILES; i++) {
            saveFoldState(`f/base${i}.py`, [`def:b${i}`]);
        }
        // Touch the OLDEST entry so it becomes most-recent…
        saveFoldState("f/base0.py", ["def:touched"]);
        // …then push 5 more files past the cap.
        for (let i = 0; i < 5; i++) {
            saveFoldState(`f/extra${i}.py`, [`def:e${i}`]);
        }
        const map = loadFoldState();
        expect(Object.keys(map).length).toBe(FOLD_STATE_MAX_FILES);
        // base0 survived the trim because it was re-written recently.
        expect(map["f/base0.py"]).toEqual(["def:touched"]);
        // An untouched early entry got dropped instead.
        expect(map["f/base1.py"]).toBeUndefined();
    });

    it("no-ops without a file id", () => {
        saveFoldState("", ["def:x"]);
        expect(storage.getItem(FOLD_STATE_STORAGE_KEY)).toBeNull();
    });
});

describe("clearFoldState", () => {
    it("removes exactly one entry", () => {
        saveFoldState("f/a.py", ["def:a"]);
        saveFoldState("f/b.py", ["def:b"]);
        clearFoldState("f/a.py");
        const map = loadFoldState();
        expect(map["f/a.py"]).toBeUndefined();
        expect(map["f/b.py"]).toEqual(["def:b"]);
    });

    it("is a no-op for unknown ids and empty keys", () => {
        clearFoldState("f/ghost.py");
        clearFoldState("");
        expect(loadFoldState()).toEqual({});
    });
});

describe("SSR guard", () => {
    it("never throws when window is undefined", () => {
        vi.unstubAllGlobals();
        expect(loadFoldState()).toEqual({});
        expect(restoreFoldKeys("f/a.py")).toEqual([]);
        expect(() => saveFoldState("f/a.py", ["def:x"])).not.toThrow();
        expect(() => clearFoldState("f/a.py")).not.toThrow();
    });
});
