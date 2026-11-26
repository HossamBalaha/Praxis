/**
 * Server-side keyring for AI provider API keys (/ security).
 *
 * Problem: provider API keys used to live in localStorage (Settings →
 * AI), which means any XSS in the app — or any other script running
 * on the same origin — could read them with localStorage.getItem.
 *
 * This module gives users the option to keep keys OUT of the browser
 * entirely: they are stored in a JSON file next to the home
 * directory (never inside the repo, never in the app bundle):
 *
 * ~/.praxis/ai-keys.json { "<baseUrlSlug>": "<key>", … }
 *
 * with 0600 permissions. The client stores only the endpoint URL; at
 * request time the server routes resolve the key from this file (see
 * resolveServerKey in lib/ai.ts). The /api/ai-keys route exposes
 * masked listings + write/delete so the Settings UI never sees the
 * raw key either.
 *
 * Scope note: this is a single-user, localhost-first tool — the
 * keyring is not multi-tenant. If you expose Praxis on a LAN with
 * PRAXIS_ACCESS_TOKEN set, the token protects the keyring route too.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Directory that holds the keyring (~/.praxis). */
function keyringDir(): string {
    const override = process.env.PRAXIS_KEYRING_DIR;
    if (override && override.trim()) return override.trim();
    return path.join(os.homedir(), ".praxis");
}

/** Full path of the keyring file. */
export function keyringPath(): string {
    return path.join(keyringDir(), "ai-keys.json");
}

type Keyring = Record<string, string>;

/** Slug for an endpoint URL so http://localhost:11434/v1/ and
 *  http://localhost:11434/v1 map to the same slot. */
export function endpointSlug(baseUrl: string): string {
    return baseUrl.trim().toLowerCase().replace(/\/+$/, "").slice(0, 300);
}

function readKeyring(): Keyring {
    try {
        const raw = fs.readFileSync(keyringPath(), "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const out: Keyring = {};
            for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
                if (typeof k === "string" && typeof v === "string") out[k] = v;
            }
            return out;
        }
        return {};
    } catch {
        return {};
    }
}

function writeKeyring(data: Keyring): void {
    const dir = keyringDir();
    fs.mkdirSync(dir, {recursive: true});
    const file = keyringPath();
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", {
        mode: 0o600,
    });
    // Best-effort tightening if the file already existed with wider perms.
    try {
        fs.chmodSync(file, 0o600);
    } catch {
        /* ignore */
    }
}

/** Store a key for an endpoint. Returns true on success. */
export function storeKey(baseUrl: string, key: string): boolean {
    const slug = endpointSlug(baseUrl);
    if (!slug || !key) return false;
    const data = readKeyring();
    data[slug] = key.slice(0, 500);
    writeKeyring(data);
    return true;
}

/** Fetch the stored key for an endpoint ("" if none). */
export function resolveKey(baseUrl: string): string {
    const slug = endpointSlug(baseUrl);
    if (!slug) return "";
    return readKeyring()[slug] ?? "";
}

/** Remove the stored key for an endpoint. Returns true if it existed. */
export function deleteKey(baseUrl: string): boolean {
    const slug = endpointSlug(baseUrl);
    const data = readKeyring();
    if (!(slug in data)) return false;
    delete data[slug];
    writeKeyring(data);
    return true;
}

/** Mask a key for display: keep the first 3 and last 4 chars only. */
export function maskKey(key: string): string {
    if (!key) return "";
    if (key.length <= 8) return "*".repeat(key.length);
    return `${key.slice(0, 3)}${"*".repeat(Math.min(key.length - 7, 24))}${key.slice(-4)}`;
}

/** List all stored endpoints with masked keys (for the Settings UI). */
export function listKeys(): Array<{ endpoint: string; masked: string }> {
    return Object.entries(readKeyring()).map(([endpoint, key]) => ({
        endpoint,
        masked: maskKey(key),
    }));
}
