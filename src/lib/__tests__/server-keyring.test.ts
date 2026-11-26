/**
 * server-keyring.test.ts — unit tests for src/lib/server-keyring.ts.
 *
 * The server-side keyring stores AI provider API keys in
 * <PRAXIS_KEYRING_DIR>/ai-keys.json (default ~/.praxis/ai-keys.json) with
 * 0600 permissions. The module reads the env var on EVERY call (no import
 * -time caching), so the tests can point it at a fresh temp directory:
 *
 *   - storeKey → resolveKey round-trip, incl. endpoint-slug normalization
 *     (trailing slashes, mixed case, whitespace) mapping to ONE slot
 *   - overwriting, the 500-char key cap, and empty-input rejection
 *   - deleteKey semantics (true once, false afterwards)
 *   - listKeys masked output — maskKey keeps the first 3 + last 4 chars,
 *     short keys (≤ 8 chars) are fully starred
 *   - keyringPath honoring PRAXIS_KEYRING_DIR
 *   - resilience: a corrupt / non-object keyring file reads as empty and
 *     the next storeKey rewrites valid JSON
 *   - the file is written with 0600 permissions
 *
 * All filesystem activity is confined to a per-process temp dir that is
 * removed recursively in afterAll.
 */
import fs from "node:fs";
import path from "node:path";
import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {deleteKey, endpointSlug, keyringPath, listKeys, maskKey, resolveKey, storeKey,} from "@/lib/server-keyring";

const TMP_DIR = `/tmp/praxis-keyring-test-${process.pid}`;

beforeAll(() => {
    fs.mkdirSync(TMP_DIR, {recursive: true});
    process.env.PRAXIS_KEYRING_DIR = TMP_DIR;
});

afterAll(() => {
    fs.rmSync(TMP_DIR, {recursive: true, force: true});
    delete process.env.PRAXIS_KEYRING_DIR;
});

/** Wipe the keyring file between tests so each starts from a clean slate. */
beforeEach(() => {
    fs.rmSync(keyringPath(), {force: true});
});

describe("keyringPath", () => {
    it("honors the PRAXIS_KEYRING_DIR override", () => {
        expect(keyringPath()).toBe(path.join(TMP_DIR, "ai-keys.json"));
    });
});

describe("endpointSlug", () => {
    it("trims, lowercases and strips trailing slashes", () => {
        expect(endpointSlug("http://localhost:11434/v1/")).toBe("http://localhost:11434/v1");
        expect(endpointSlug("  HTTP://LocalHost:11434/v1  ")).toBe("http://localhost:11434/v1");
        expect(endpointSlug("https://api.example.com///")).toBe("https://api.example.com");
    });

    it("collapses case and slash variants of the same endpoint to one slot", () => {
        expect(endpointSlug("HTTP://LOCALHOST:11434/V1/")).toBe(endpointSlug("http://localhost:11434/v1"));
    });

    it("truncates very long endpoints to 300 chars", () => {
        const long = "https://" + "a".repeat(400) + ".com";
        expect(endpointSlug(long)).toHaveLength(300);
        expect(endpointSlug(long)).toBe(long.trim().toLowerCase().slice(0, 300));
    });

    it("whitespace-only input slugs to the empty string", () => {
        expect(endpointSlug("   ")).toBe("");
    });
});

describe("maskKey", () => {
    it("keeps the first 3 and last 4 chars, stars in between", () => {
        // 17 chars → stars = min(17 - 7, 24) = 10.
        expect(maskKey("sk-1234567890abcd")).toBe("sk-" + "*".repeat(10) + "abcd");
    });

    it("caps the star run at 24 for very long keys", () => {
        const key = "sk-" + "x".repeat(60); // 63 chars → 56 stars would be > 24
        expect(maskKey(key)).toBe("sk-" + "*".repeat(24) + "xxxx");
    });

    it("masks short keys (≤ 8 chars) entirely with stars", () => {
        expect(maskKey("")).toBe("");
        expect(maskKey("abc")).toBe("***");
        expect(maskKey("12345678")).toBe("********");
    });

    it("9-char keys get first3 + 2 stars + last4", () => {
        expect(maskKey("123456789")).toBe("123**6789");
    });
});

describe("storeKey / resolveKey", () => {
    it("round-trips a key for a plain endpoint", () => {
        expect(storeKey("https://api.openai.com/v1", "sk-abc123def456")).toBe(true);
        expect(resolveKey("https://api.openai.com/v1")).toBe("sk-abc123def456");
    });

    it("endpoint variants (case / trailing slash / whitespace) share one slot", () => {
        expect(storeKey("http://localhost:11434/v1/", "key-one")).toBe(true);
        expect(resolveKey("HTTP://LOCALHOST:11434/v1")).toBe("key-one");
        expect(resolveKey("  http://localhost:11434/v1///  ")).toBe("key-one");
    });

    it("returns '' for an endpoint with no stored key", () => {
        expect(resolveKey("https://never.stored.example/v1")).toBe("");
    });

    it("rejects an empty endpoint or empty key without writing", () => {
        expect(storeKey("", "sk-key")).toBe(false);
        expect(storeKey("   ", "sk-key")).toBe(false);
        expect(storeKey("https://api.example.com", "")).toBe(false);
        expect(resolveKey("")).toBe("");
    });

    it("overwrites the previous key for the same endpoint", () => {
        storeKey("https://api.example.com/v1", "first-key");
        storeKey("https://api.example.com/v1/", "second-key");
        expect(resolveKey("https://api.example.com/V1")).toBe("second-key");
    });

    it("caps stored keys at 500 characters", () => {
        const longKey = "k".repeat(600);
        storeKey("https://api.example.com/v1", longKey);
        expect(resolveKey("https://api.example.com/v1")).toHaveLength(500);
        expect(resolveKey("https://api.example.com/v1")).toBe("k".repeat(500));
    });

    it("persists to disk as JSON under the slug key", () => {
        storeKey("https://api.example.com/v1", "sk-disk");
        const raw = fs.readFileSync(keyringPath(), "utf8");
        expect(JSON.parse(raw)).toEqual({"https://api.example.com/v1": "sk-disk"});
    });
});

describe("deleteKey", () => {
    it("returns true once and removes the key", () => {
        storeKey("https://api.example.com/v1", "sk-gone");
        expect(deleteKey("https://api.example.com/v1/")).toBe(true); // slug-normalized
        expect(resolveKey("https://api.example.com/v1")).toBe("");
        expect(deleteKey("https://api.example.com/v1")).toBe(false); // already gone
    });

    it("returns false for an endpoint that was never stored", () => {
        expect(deleteKey("https://never.stored.example/v1")).toBe(false);
    });
});

describe("listKeys", () => {
    it("lists stored endpoints with masked keys", () => {
        storeKey("https://api.openai.com/v1", "sk-1234567890abcd");
        storeKey("http://localhost:11434/v1", "local-key-9876");
        const listed = listKeys().sort((a, b) => a.endpoint.localeCompare(b.endpoint));
        expect(listed.map((e) => e.endpoint)).toEqual([
            "http://localhost:11434/v1",
            "https://api.openai.com/v1",
        ]);
        expect(listed[1].masked).toBe("sk-" + "*".repeat(10) + "abcd");
        // The masked listing must never leak the raw key.
        expect(JSON.stringify(listed)).not.toContain("sk-1234567890abcd");
    });

    it("returns [] for an empty keyring", () => {
        expect(listKeys()).toEqual([]);
    });
});

describe("resilience to a corrupt keyring file", () => {
    it("treats invalid JSON as an empty keyring", () => {
        fs.writeFileSync(keyringPath(), "{{{ broken", "utf8");
        expect(resolveKey("https://api.example.com/v1")).toBe("");
        expect(listKeys()).toEqual([]);
    });

    it("treats a JSON array or non-string values as an empty keyring", () => {
        fs.writeFileSync(keyringPath(), JSON.stringify(["a", "b"]), "utf8");
        expect(listKeys()).toEqual([]);
        fs.writeFileSync(keyringPath(), JSON.stringify({a: 1, b: null}), "utf8");
        expect(listKeys()).toEqual([]);
        expect(resolveKey("a")).toBe("");
    });

    it("recovers by rewriting valid JSON on the next store", () => {
        fs.writeFileSync(keyringPath(), "garbage", "utf8");
        expect(storeKey("https://api.example.com/v1", "sk-recovered")).toBe(true);
        expect(resolveKey("https://api.example.com/v1")).toBe("sk-recovered");
    });
});

describe("file permissions", () => {
    it("writes the keyring with 0600 permissions (owner-only)", () => {
        storeKey("https://api.example.com/v1", "sk-perm");
        const mode = fs.statSync(keyringPath()).mode & 0o777;
        if (process.platform === "win32") {
            // Windows fs.chmod only honors the read-only bit — the POSIX 0600
            // mode never materializes (the file stays 0666). Assert the file
            // EXISTS and is not read-only instead of a mode that Windows
            // cannot express.
            expect(mode & 0o444).toBe(0o444); // readable by the owner
        } else {
            expect(mode).toBe(0o600);
        }
    });
});
