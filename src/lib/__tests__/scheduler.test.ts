/**
 * scheduler.test.ts — unit tests for src/lib/scheduler.ts.
 *
 * The browser-side "re-run every N minutes" scheduler persists its list in
 * localStorage under "praxis.schedules.v1". Covered:
 *   - loadSchedules/saveSchedules round-trip with a mocked
 *     window.localStorage
 *   - invalid persisted data: malformed JSON, non-array payloads, and
 *     per-entry validation (missing id/folderSlug/fileSlug, everyMinutes < 1)
 *   - nextDueAt: lastRunAt null → createdAt + period; lastRunAt set →
 *     lastRunAt + period
 *   - formatInterval: whole hours render as "1h"/"24h", everything else
 *     as "<n>m" (incl. 90 → "90m")
 *   - formatIn: negative/zero → "due now", sub-minute → "in Ns",
 *     65 000 ms → "in 1m 05s", and the ceil edge at 59 999 ms
 *   - MIN_TICK_MS and newScheduleId shape/uniqueness
 */
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    formatIn,
    formatInterval,
    loadSchedules,
    MIN_TICK_MS,
    newScheduleId,
    nextDueAt,
    saveSchedules,
    type Schedule,
} from "@/lib/scheduler";

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

const KEY = "praxis.schedules.v1";

function sched(overrides: Partial<Schedule> = {}): Schedule {
    return {
        id: "sch-1",
        label: "Data Analysis/DescriptiveStats.py",
        folderSlug: "RGF0YSBBbmFseXNpcw",
        fileSlug: "RGVzY3JpcHRpdmVTdGF0cy5weQ",
        everyMinutes: 15,
        enabled: true,
        lastRunAt: null,
        createdAt: 1_700_000_000_000,
        ...overrides,
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

describe("loadSchedules / saveSchedules", () => {
    it("returns [] when nothing is stored", () => {
        expect(loadSchedules()).toEqual([]);
    });

    it("round-trips a saved schedule list", () => {
        const list = [
            sched(),
            sched({id: "sch-2", everyMinutes: 60, lastRunAt: 1_700_000_100_000, enabled: false}),
        ];
        saveSchedules(list);
        expect(loadSchedules()).toEqual(list);
    });

    it("degrades to [] on malformed JSON", () => {
        storage.setItem(KEY, "not json at all");
        expect(loadSchedules()).toEqual([]);
    });

    it("degrades to [] when the payload is valid JSON but not an array", () => {
        storage.setItem(KEY, JSON.stringify({schedules: []}));
        expect(loadSchedules()).toEqual([]);
    });

    it("drops entries that fail per-entry validation", () => {
        storage.setItem(
            KEY,
            JSON.stringify([
                sched(), // valid
                {id: "x", folderSlug: "f", fileSlug: "b"}, // missing everyMinutes
                {id: "x", folderSlug: "f", fileSlug: "b", everyMinutes: 0}, // < 1
                {id: "x", folderSlug: "f", fileSlug: "b", everyMinutes: 0.5}, // < 1
                {folderSlug: "f", fileSlug: "b", everyMinutes: 5}, // missing id
                {id: "x", fileSlug: "b", everyMinutes: 5}, // missing folderSlug
                {id: "x", folderSlug: "f", everyMinutes: 5}, // missing fileSlug
                "junk", // not an object
                null,
            ])
        );
        const loaded = loadSchedules();
        expect(loaded).toHaveLength(1);
        expect(loaded[0].id).toBe("sch-1");
    });

    it("accepts the minimal valid entry (label/enabled/etc. are not validated)", () => {
        storage.setItem(
            KEY,
            JSON.stringify([{id: "m", folderSlug: "f", fileSlug: "b", everyMinutes: 1}])
        );
        expect(loadSchedules()).toHaveLength(1);
    });
});

describe("nextDueAt", () => {
    it("a never-fired schedule is due one full period after createdAt", () => {
        const s = sched({createdAt: 1_700_000_000_000, everyMinutes: 15, lastRunAt: null});
        expect(nextDueAt(s)).toBe(1_700_000_000_000 + 15 * 60_000);
    });

    it("a fired schedule is due one full period after lastRunAt", () => {
        const s = sched({
            createdAt: 1_700_000_000_000,
            everyMinutes: 30,
            lastRunAt: 1_700_005_000_000,
        });
        expect(nextDueAt(s)).toBe(1_700_005_000_000 + 30 * 60_000);
    });

    it("lastRunAt wins over createdAt even when earlier", () => {
        const s = sched({
            createdAt: 1_700_000_000_000,
            everyMinutes: 10,
            lastRunAt: 1_699_999_000_000,
        });
        expect(nextDueAt(s)).toBe(1_699_999_000_000 + 10 * 60_000);
    });
});

describe("formatInterval", () => {
    it("renders whole hours as '<n>h'", () => {
        expect(formatInterval(60)).toBe("1h");
        expect(formatInterval(120)).toBe("2h");
        expect(formatInterval(1440)).toBe("24h");
    });

    it("renders everything else as '<n>m'", () => {
        expect(formatInterval(90)).toBe("90m");
        expect(formatInterval(15)).toBe("15m");
        expect(formatInterval(45)).toBe("45m");
        expect(formatInterval(1)).toBe("1m");
    });
});

describe("formatIn", () => {
    it("renders negative and zero remainders as 'due now'", () => {
        expect(formatIn(-1)).toBe("due now");
        expect(formatIn(0)).toBe("due now");
    });

    it("renders sub-minute remainders as seconds", () => {
        expect(formatIn(1000)).toBe("in 1s");
        expect(formatIn(59_000)).toBe("in 59s");
    });

    it("renders minutes with zero-padded seconds", () => {
        expect(formatIn(65_000)).toBe("in 1m 05s");
        expect(formatIn(125_000)).toBe("in 2m 05s");
        expect(formatIn(60_000)).toBe("in 1m 00s");
    });

    it("rounds partial seconds UP via ceil (59 999 ms → a full minute)", () => {
        // Math.ceil(59.999) = 60 → 1 minute, 0 seconds.
        expect(formatIn(59_999)).toBe("in 1m 00s");
        expect(formatIn(59_001)).toBe("in 1m 00s");
        expect(formatIn(59_000)).toBe("in 59s");
    });
});

describe("constants and id generation", () => {
    it("MIN_TICK_MS is 30 seconds", () => {
        expect(MIN_TICK_MS).toBe(30_000);
    });

    it("newScheduleId has the sch-<time>-<rand> shape", () => {
        expect(newScheduleId()).toMatch(/^sch-[a-z0-9]+-[a-z0-9]{5}$/);
    });

    it("newScheduleId generates unique ids", () => {
        const ids = new Set(Array.from({length: 100}, () => newScheduleId()));
        expect(ids.size).toBe(100);
    });
});
