/**
 * ai-sampling-storage.test.ts — unit tests for readPersistedSampling
 * in src/lib/ai-shared.ts (and its storage-key constant).
 *
 * readPersistedSampling is the client-side half of threading the chat
 * sidebar's Tuning popover knobs (temperature / max_tokens / top_p)
 * into OTHER AI call sites — code-viewer's completion fetch. It reads
 * `${STORAGE_PREFIX}-ai-sampling` from window.localStorage and runs the
 * value through the shared server sanitizer (sanitizeSampling), so the
 * covered contract is:
 * - absent key → null (send nothing, provider defaults)
 * - valid JSON → sanitized SamplingParams (clamped+rounded)
 * - out-of-bounds values → clamped into SAMPLING_BOUNDS
 * - corrupt JSON → null (never throws)
 * - valid JSON, bad shape → null
 * - SSR (no window) → null (isomorphic-safe guard)
 *
 * The node vitest environment has no DOM, so window/localStorage are
 * installed per-test via vi.stubGlobal with an in-memory Storage
 * (the same pattern shortcuts.test.ts / scheduler.test.ts use).
 */
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {AI_SAMPLING_STORAGE_KEY, readPersistedSampling, SAMPLING_BOUNDS,} from "@/lib/ai-shared";
import {STORAGE_PREFIX} from "@/lib/config";

/* ─── Test doubles ─────────────────────────────────────────────────── */

/** Minimal in-memory localStorage. */
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

/* ─── Fixture install/teardown ─────────────────────────────────────── */

let storage: Storage;

beforeEach(() => {
    storage = makeLocalStorage();
    vi.stubGlobal("window", {localStorage: storage});
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/** Store a raw string under the sampling key (bypasses sanitization —
 *  the point is to feed readPersistedSampling UNTRUSTED bytes). */
function seedRaw(raw: string) {
    window.localStorage.setItem(AI_SAMPLING_STORAGE_KEY, raw);
}

/* ─── The storage key ──────────────────────────────────────────────── */

describe("AI_SAMPLING_STORAGE_KEY", () => {
    it("is `${STORAGE_PREFIX}-ai-sampling` (the sidebar's key)", () => {
        // ai-chat-sidebar.tsx builds the same string inline — the
        // completion fetch must read the exact key the Tuning popover
        // writes, or the knobs would silently not apply.
        expect(AI_SAMPLING_STORAGE_KEY).toBe(`${STORAGE_PREFIX}-ai-sampling`);
    });
});

/* ─── readPersistedSampling ────────────────────────────────────────── */

describe("readPersistedSampling", () => {
    it("returns null when the key is absent (provider defaults)", () => {
        expect(window.localStorage.getItem(AI_SAMPLING_STORAGE_KEY)).toBeNull();
        expect(readPersistedSampling()).toBeNull();
    });

    it("returns sanitized params for a valid persisted payload", () => {
        seedRaw(JSON.stringify({temperature: 0.7, topP: 0.9, maxTokens: 1024}));
        expect(readPersistedSampling()).toEqual({
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 1024,
        });
    });

    it("rounds like the sanitizer (2dp floats, int maxTokens)", () => {
        seedRaw(
            JSON.stringify({temperature: 0.678, topP: 0.914, maxTokens: 512.7})
        );
        expect(readPersistedSampling()).toEqual({
            temperature: 0.68,
            topP: 0.91,
            maxTokens: 513,
        });
    });

    it("clamps out-of-bounds values into SAMPLING_BOUNDS", () => {
        seedRaw(JSON.stringify({temperature: 99, topP: 5, maxTokens: 1}));
        expect(readPersistedSampling()).toEqual({
            temperature: SAMPLING_BOUNDS.temperature.max,
            topP: SAMPLING_BOUNDS.topP.max,
            maxTokens: SAMPLING_BOUNDS.maxTokens.min,
        });

        seedRaw(JSON.stringify({temperature: -5, topP: -1, maxTokens: 999999}));
        expect(readPersistedSampling()).toEqual({
            temperature: SAMPLING_BOUNDS.temperature.min,
            topP: SAMPLING_BOUNDS.topP.min,
            maxTokens: SAMPLING_BOUNDS.maxTokens.max,
        });
    });

    it("returns null for corrupt JSON (never throws)", () => {
        seedRaw('{"temperature": 0.7, "topP": 0.9, "maxTokens":'); // truncated
        expect(readPersistedSampling()).toBeNull();

        seedRaw("not json at all {{{");
        expect(readPersistedSampling()).toBeNull();
    });

    it("returns null for valid JSON that is not a sampling payload", () => {
        // A stale/hand-edited value can hold anything — the helper must
        // degrade to "provider defaults", not ship garbage downstream.
        seedRaw(JSON.stringify("hot"));
        expect(readPersistedSampling()).toBeNull();

        seedRaw(JSON.stringify(42));
        expect(readPersistedSampling()).toBeNull();

        seedRaw(JSON.stringify(null));
        expect(readPersistedSampling()).toBeNull();

        // Missing knobs → wholly invalid per sanitizeSampling.
        seedRaw(JSON.stringify({temperature: 0.7, topP: 0.9}));
        expect(readPersistedSampling()).toBeNull();
    });

    it("returns null on SSR / non-browser (typeof window undefined)", () => {
        // Simulate the server: no window global at all (node vitest env
        // has none until the beforeEach stub installs one).
        vi.unstubAllGlobals();
        expect((globalThis as { window?: unknown }).window).toBeUndefined();
        expect(readPersistedSampling()).toBeNull();
    });

    it("returns null when window exists but localStorage does not", () => {
        // Some embedded webviews/privacy modes expose a window without a
        // usable localStorage — the optional chain must degrade, not throw.
        vi.stubGlobal("window", {});
        expect(readPersistedSampling()).toBeNull();
    });

    it("returns null when localStorage access throws (locked-down mode)", () => {
        const throwing: Storage = {
            ...makeLocalStorage(),
            getItem: () => {
                // Privacy modes / disabled storage can throw on access.
                throw new Error("SecurityError: storage denied");
            },
        };
        vi.stubGlobal("window", {localStorage: throwing});
        expect(readPersistedSampling()).toBeNull();
    });
});
