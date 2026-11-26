/**
 * small
 * client-side utilities shared by several new tools.
 */

// ─── Encoding / hashing / ids ───────────────────────────────────────

export function toBase64Utf8(text: string): string {
    return btoa(unescape(encodeURIComponent(text)));
}

export function fromBase64Utf8(b64: string): string {
    return decodeURIComponent(escape(atob(b64.trim())));
}

export async function shaHex(
    text: string,
    algorithm: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512"
): Promise<string> {
    const buf = await crypto.subtle.digest(algorithm, new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function uuidBatch(count: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < Math.max(0, Math.min(count, 500)); i++) {
        out.push(crypto.randomUUID());
    }
    return out;
}

// ─── Timestamp / epoch conversion ───────────────────────────────────

export interface TimestampFacts {
    epochMs: number;
    iso: string;
    utc: string;
    local: string;
    relative: string;
}

/**
 * Humanize the distance of an instant from `now` — "in 3 days",
 * "2 hours ago". Shared by the Time tool (via timestampFacts) and
 * the JWT decoder (exp / nbf / iat claims).
 */
export function relativeTimeFrom(ms: number, now: number = Date.now()): string {
    const diff = ms - now;
    const abs = Math.abs(diff);
    const units: [number, string][] = [
        [1000, "second"],
        [60_000, "minute"],
        [3_600_000, "hour"],
        [86_400_000, "day"],
        [30 * 86_400_000, "month"],
        [365 * 86_400_000, "year"],
    ];
    let chosen: [number, string] = units[0];
    for (const u of units) if (abs >= u[0]) chosen = u;
    const n = Math.max(1, Math.round(abs / chosen[0]));
    return diff >= 0
        ? `in ${n} ${chosen[1]}${n > 1 ? "s" : ""}`
        : `${n} ${chosen[1]}${n > 1 ? "s" : ""} ago`;
}

export function timestampFacts(input: string): TimestampFacts | null {
    const t = input.trim();
    if (!t) return null;
    let ms: number | null = null;
    if (/^-?\d+$/.test(t)) {
        const n = parseInt(t, 10);
        ms = t.length <= 11 ? n * (t.length <= 10 ? 1000 : 1) : n;
    } else {
        const parsed = Date.parse(t);
        if (!Number.isNaN(parsed)) ms = parsed;
    }
    if (ms === null) return null;
    const d = new Date(ms);
    return {
        epochMs: ms,
        iso: d.toISOString(),
        utc: d.toUTCString(),
        local: d.toLocaleString(),
        relative: relativeTimeFrom(ms),
    };
}

// ─── Color conversion ───────────────────────────────────────────────

export interface RgbColor {
    r: number;
    g: number;
    b: number
}

export function parseColor(input: string): RgbColor | null {
    const t = input.trim().toLowerCase();
    const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t);
    if (hex) {
        let h = hex[1];
        if (h.length === 3) h = [...h].map((c) => c + c).join("");
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
        };
    }
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(t);
    if (rgb) return {r: +rgb[1], g: +rgb[2], b: +rgb[3]};
    return null;
}

export function rgbToHex({r, g, b}: RgbColor): string {
    const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
}

export function rgbToHsl({r, g, b}: RgbColor): { h: number; s: number; l: number } {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        else if (max === gn) h = ((bn - rn) / d + 2) / 6;
        else h = ((rn - gn) / d + 4) / 6;
    }
    return {h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100)};
}

export function hslToCss(h: number, s: number, l: number): string {
    return `hsl(${h}, ${s}%, ${l}%)`;
}

/** Deterministic pleasant random palette (golden-ratio hue walk). */
export function randomPalette(count: number): string[] {
    const golden = 137.508;
    let hue = Math.random() * 360;
    const out: string[] = [];
    for (let i = 0; i < Math.max(1, Math.min(count, 36)); i++) {
        hue = (hue + golden) % 360;
        out.push(hslToCss(Math.round(hue), 68, 52));
    }
    return out;
}

// ─── HTML entities ──────────────────────────────────────────────────

export function escapeHtmlEntities(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function unescapeHtmlEntities(text: string): string {
    // DOMParser only exists in the browser — fall back to a plain map
    // in Node (tests / SSR).
    if (typeof DOMParser === "undefined") {
        return text
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, "&");
    }
    const doc = new DOMParser().parseFromString(text, "text/html");
    return doc.documentElement.textContent ?? "";
}

// ─── Faker (offline, deterministic-with-seed option) ────────────────

const FIRST_NAMES = [
    "Amina", "Arjun", "Beatrix", "Caleb", "Dalia", "Dario", "Elena", "Emeka",
    "Farida", "Felix", "Grace", "Hana", "Idris", "Ivy", "Jonas", "Kira",
    "Liam", "Lena", "Mateo", "Maya", "Nadia", "Noah", "Omar", "Olga",
    "Priya", "Pablo", "Quinn", "Rania", "Ravi", "Sofia", "Sami", "Tara",
    "Tomas", "Uma", "Victor", "Wren", "Yara", "Zane", "Zoe", "Nasr",
];
const LAST_NAMES = [
    "Abbott", "Baraka", "Castillo", "Duarte", "Eriksen", "Farouk", "Grimaldi",
    "Haddad", "Ibarra", "Jensen", "Kowalski", "Laurent", "Marchetti", "Nakamura",
    "Okonkwo", "Petrov", "Quintero", "Rossi", "Silva", "Tanaka", "Ustinov",
    "Vargas", "Wolff", "Yousif", "Zamora", "Novak", "Okafor", "Larsen",
];
const STREETS = ["Maple", "Cedar", "Birch", " Aspen", "Juniper", "Magnolia", "Willow", "Rowan"];
const SUFFIX = ["St", "Ave", "Rd", "Ln", "Blvd", "Way", "Ct"];
const CITIES = ["Springfield", "Riverton", "Fairview", "Lakeside", "Hillcrest", "Meadowbrook"];
const DOMAINS = ["example.com", "test.org", "sample.net", "mail.example", "acme.test"];
const WORDS = [
    "amber", "basalt", "cobalt", "dune", "ember", "fjord", "gale", "harbor",
    "indigo", "jasper", "kelp", "lagoon", "moss", "nectar", "onyx", "prairie",
    "quartz", "reef", "sable", "tundra", "umber", "vellum", "willow", "zenith",
];

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export type FakerKind =
    | "name" | "email" | "address" | "phone" | "company" | "sentence" | "words" | "number";

export interface FakerOptions {
    count: number;
    kind: FakerKind;
    seed?: number;
}

export function generateFakeData({count, kind, seed}: FakerOptions): string[] {
    const rand = mulberry32(seed ?? (Date.now() & 0xffffffff));
    const pick = <T, >(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
    const n = Math.max(1, Math.min(count, 500));
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
        switch (kind) {
            case "name":
                out.push(`${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`);
                break;
            case "email": {
                const f = pick(FIRST_NAMES).toLowerCase();
                const l = pick(LAST_NAMES).toLowerCase();
                out.push(`${f}.${l}${Math.floor(rand() * 90) + 10}@${pick(DOMAINS)}`);
                break;
            }
            case "address":
                out.push(`${Math.floor(rand() * 9000) + 100} ${pick(STREETS).trim()} ${pick(SUFFIX)}, ${pick(CITIES)}`);
                break;
            case "phone":
                out.push(`+1 (${Math.floor(rand() * 800) + 200}) ${Math.floor(rand() * 900) + 100}-${String(Math.floor(rand() * 9000) + 1000)}`);
                break;
            case "company":
                out.push(`${pick(WORDS).replace(/^./, (c) => c.toUpperCase())} ${pick(["Systems", "Labs", "Works", "Group", "Digital", "Industries"])}`);
                break;
            case "sentence": {
                const len = Math.floor(rand() * 10) + 4;
                const ws = Array.from({length: len}, () => pick(WORDS));
                ws[0] = ws[0].replace(/^./, (c) => c.toUpperCase());
                out.push(`${ws.join(" ")}.`);
                break;
            }
            case "words": {
                const len = Math.floor(rand() * 3) + 2;
                out.push(Array.from({length: len}, () => pick(WORDS)).join(" "));
                break;
            }
            case "number":
                out.push(String(Math.floor(rand() * 1_000_000)));
                break;
        }
    }
    return out;
}

export function loremIpsum(paragraphs: number, seed?: number): string {
    const rand = mulberry32(seed ?? (Date.now() & 0xffffffff));
    const pick = <T, >(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
    const n = Math.max(1, Math.min(paragraphs, 20));
    const paras: string[] = [];
    for (let p = 0; p < n; p++) {
        const sentences = Math.floor(rand() * 4) + 3;
        const ss: string[] = [];
        for (let s = 0; s < sentences; s++) {
            const len = Math.floor(rand() * 14) + 6;
            const ws = Array.from({length: len}, () => pick(WORDS));
            ws[0] = ws[0].replace(/^./, (c) => c.toUpperCase());
            ss.push(`${ws.join(" ")}.`);
        }
        paras.push(ss.join(" "));
    }
    return paras.join("\n\n");
}
