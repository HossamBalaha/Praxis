/**
 * the pure helpers behind the
 * 33 additional offline tools. Zero new npm dependencies — everything
 * here is plain TypeScript (the QR encoder lives in qr.ts).
 *
 * Grouped by tool category; every function is synchronous and pure
 * (except jwtSignHs256, which uses WebCrypto) so the unit-test file
 * covers the real logic the UI runs.
 */

/* ── Hash / crypto ────────────────────────────────────────────────── */

/** Standard CRC-32 (IEEE 802.3, reflected, poly 0xEDB88320). */
export function crc32(text: string): string {
    let crc = 0xffffffff;
    for (let i = 0; i < text.length; i++) {
        crc ^= text.charCodeAt(i) & 0xff;
        for (let j = 0; j < 8; j++) {
            crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
    }
    return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

/** HMAC-SHA256 → base64url, the JWT HS256 signature. */
async function hmacSha256(key: string, message: string): Promise<string> {
    const enc = new TextEncoder();
    const cryptoObj = globalThis.crypto;
    const k = await cryptoObj.subtle.importKey(
        "raw",
        enc.encode(key),
        {name: "HMAC", hash: "SHA-256"},
        false,
        ["sign"]
    );
    const sig = await cryptoObj.subtle.sign("HMAC", k, enc.encode(message));
    const bytes = new Uint8Array(sig);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sign a JWT (HS256). Header/payload are objects; exp is optional. */
export async function jwtSignHs256(
    payload: Record<string, unknown>,
    secret: string,
    expiresInSeconds?: number
): Promise<string> {
    const b64url = (obj: unknown) =>
        btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const now = Math.floor(Date.now() / 1000);
    const finalPayload: Record<string, unknown> = {...payload, iat: now};
    if (typeof expiresInSeconds === "number" && expiresInSeconds > 0) {
        finalPayload.exp = now + expiresInSeconds;
    }
    const header = {alg: "HS256", typ: "JWT"};
    const signingInput = `${b64url(header)}.${b64url(finalPayload)}`;
    const sig = await hmacSha256(secret, signingInput);
    return `${signingInput}.${sig}`;
}

/* ── Identifiers ──────────────────────────────────────────────────── */

/** UUID v7 — 48-bit ms timestamp + random, lexicographically sortable. */
export function uuidv7(now: number = Date.now()): string {
    // 48-bit ms timestamps fit safely in a JS Number (< 2^53) — no BigInt
    // needed (and BigInt literals are off-limits below ES2020 targets).
    const tsHex = Math.max(0, Math.floor(now)).toString(16).padStart(12, "0");
    const rand = new Uint8Array(10);
    crypto.getRandomValues(rand);
    const hex = [...rand].map((b) => b.toString(16).padStart(2, "0")).join("");
    // Variant nibble: top bit set, second bit clear → 8/9/a/b.
    const variant = ((parseInt(hex[3], 16) & 0x3) | 0x8).toString(16);
    return (
        `${tsHex.slice(0, 8)}-${tsHex.slice(8)}-7${hex.slice(0, 3)}-` +
        `${variant}${hex.slice(4, 7)}-${hex.slice(7, 19)}`
    ).toLowerCase();
}

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID — 48-bit timestamp (Crockford base32, 10 chars) + 80 random bits (16 chars). */
export function ulid(now: number = Date.now()): string {
    const encodeTime = (t: number, len: number): string => {
        let out = "";
        for (let i = len - 1; i >= 0; i--) {
            out += ULID_ALPHABET[Math.floor(t / 32 ** i) % 32];
        }
        return out;
    };
    const rand = new Uint8Array(16);
    crypto.getRandomValues(rand);
    let randomChars = "";
    for (let i = 0; i < 16; i++) {
        // 256 % 32 === 0, so byte % 32 is a uniform Crockford digit.
        randomChars += ULID_ALPHABET[rand[i] % 32];
    }
    return encodeTime(Math.max(0, Math.floor(now)), 10) + randomChars;
}

/** nanoid — URL-safe random ids (A-Za-z0-9_-). */
export function nanoid(size = 21): string {
    const alphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict";
    let id = "";
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < size; i++) id += alphabet[bytes[i] % alphabet.length];
    return id;
}

/* ── Password generator + entropy ─────────────────────────────────── */

export interface PasswordOptions {
    length: number;
    lower: boolean;
    upper: boolean;
    digits: boolean;
    symbols: boolean;
    excludeAmbiguous?: boolean;
}

const PW_SETS = {
    lower: "abcdefghijklmnopqrstuvwxyz",
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    digits: "0123456789",
    symbols: "!@#$%^&*()-_=+[]{};:,.<>?/~",
};
const AMBIGUOUS = "Il1O0o5S2Z|`'\"\\";

export function generatePassword(opts: PasswordOptions, rng: () => number = Math.random): string {
    let pool = [
        opts.lower ? PW_SETS.lower : "",
        opts.upper ? PW_SETS.upper : "",
        opts.digits ? PW_SETS.digits : "",
        opts.symbols ? PW_SETS.symbols : "",
    ].join("");
    if (opts.excludeAmbiguous) pool = [...pool].filter((c) => !AMBIGUOUS.includes(c)).join("");
    if (!pool) throw new Error("Pick at least one character set.");
    const len = Math.max(4, Math.min(128, Math.round(opts.length)));
    // Guarantee one char from each chosen set, then fill from the pool.
    const out: string[] = [];
    (["lower", "upper", "digits", "symbols"] as const).forEach((k) => {
        if (!opts[k]) return;
        const set = opts.excludeAmbiguous
            ? [...PW_SETS[k]].filter((c) => !AMBIGUOUS.includes(c)).join("")
            : PW_SETS[k];
        if (set) out.push(set[Math.floor(rng() * set.length)]);
    });
    while (out.length < len) out.push(pool[Math.floor(rng() * pool.length)]);
    // Shuffle (Fisher-Yates with the injected rng).
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out.slice(0, len).join("");
}

/**
 * Entropy of a password under a smallest-charset attacker model:
 * the pool is the smallest set an attacker must search given what the
 * password reveals about its recipe. Lowercase-only → 26; mixed case →
 * 52; letters+digits → 36/62; mixed alnum (case + digits, no symbol)
 * gives no signal that symbols were excluded → full printable ASCII
 * (95); an observed symbol narrows the recipe to letters + digits +
 * the common symbol row (76). Result is rounded to whole bits.
 */
export function passwordEntropyBits(pw: string): number {
    if (!pw) return 0;
    const hasUpper = /[A-Z]/.test(pw);
    const hasDigit = /[0-9]/.test(pw);
    const hasSymbol = /[^a-zA-Z0-9]/.test(pw);
    let pool: number;
    if (hasSymbol) {
        pool = 76; // 26 letters-lower + 26 upper + 10 digits + 14 common symbols
    } else if (hasUpper && hasDigit) {
        pool = 95; // full printable ASCII — symbols can't be ruled out
    } else if (hasUpper) {
        pool = 52;
    } else if (hasDigit) {
        pool = 36;
    } else {
        pool = 26;
    }
    return Math.round(pw.length * Math.log2(pool));
}

/** Rough offline crack-time estimate at 1e10 guesses/second. */
export function crackTimeEstimate(bits: number): string {
    const guesses = Math.pow(2, bits - 1);
    const seconds = guesses / 1e10;
    const units: Array<[number, string]> = [
        [1, "second"],
        [60, "minute"],
        [3600, "hour"],
        [86400, "day"],
        [86400 * 365, "year"],
        [86400 * 365 * 1000, "millennium"],
    ];
    if (seconds < 1) return "instantly";
    let chosen = units[0];
    for (const u of units) if (seconds >= u[0]) chosen = u;
    const n = seconds / chosen[0];
    if (n > 1e6) return "longer than the universe has existed";
    const label = `${n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString()} ${chosen[1]}${n >= 2 ? "s" : ""}`;
    return `~${label}`;
}

/* ── Text tools ────────────────────────────────────────────────────── */

/** Slugify: lowercase, accents folded, separators → dashes. */
export function slugify(text: string): string {
    const fold: Record<string, string> = {
        "ä": "a", "ö": "o", "ü": "u", "ß": "ss", "é": "e", "è": "e", "ê": "e", "á": "a", "à": "a",
        "â": "a", "í": "i", "ì": "i", "ó": "o", "ò": "o", "ô": "o", "ú": "u", "ù": "u", "ñ": "n",
        "ç": "c", "å": "a", "æ": "ae", "ø": "oe",
    };
    return text
        .trim()
        .replace(/[ÄÖÜßÉÈÊÁÀÂÍÌÓÒÔÚÙÑÇÅÆØäöüßéèêáàâíìóòôúùñçåæø]/g, (c) => fold[c.toLowerCase()] ?? c.toLowerCase())
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 96);
}

export interface LineOps {
    sort: "none" | "alpha" | "alpha-desc" | "length" | "length-desc" | "shuffle";
    unique: boolean;
    trim: boolean;
    removeEmpty: boolean;
    reverse: boolean;
    addLineNumbers: boolean;
}

export function transformLines(text: string, ops: LineOps): string {
    let lines = text.split("\n");
    if (ops.trim) lines = lines.map((l) => l.trimEnd());
    if (ops.removeEmpty) lines = lines.filter((l) => l.trim() !== "");
    if (ops.unique) {
        const seen = new Set<string>();
        lines = lines.filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
    }
    switch (ops.sort) {
        case "alpha":
            lines.sort((a, b) => a.localeCompare(b));
            break;
        case "alpha-desc":
            lines.sort((a, b) => b.localeCompare(a));
            break;
        case "length":
            lines.sort((a, b) => a.length - b.length || a.localeCompare(b));
            break;
        case "length-desc":
            lines.sort((a, b) => b.length - a.length || a.localeCompare(b));
            break;
        case "shuffle":
            for (let i = lines.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [lines[i], lines[j]] = [lines[j], lines[i]];
            }
            break;
        default:
            break;
    }
    if (ops.reverse) lines.reverse();
    if (ops.addLineNumbers) {
        const width = String(lines.length).length;
        lines = lines.map((l, i) => `${String(i + 1).padStart(width)} ${l}`);
    }
    return lines.join("\n");
}

export function reverseText(text: string, mode: "chars" | "words" | "lines"): string {
    if (mode === "chars") {
        // Preserve combining sequences by using Array.from on grapheme-ish split.
        return [...text].reverse().join("");
    }
    if (mode === "words") return text.split(/\s+/).reverse().join(" ");
    return text.split("\n").reverse().join("\n");
}

export type EscapeKind = "json" | "regex" | "sql" | "url-query";

const JSON_SHORT_ESCAPES: Record<string, string> = {
    "\\": "\\\\",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
    "\b": "\\b",
    "\f": "\\f",
};

/** Escape a string for embedding in JSON / regex / SQL / URLs. */
export function escapeString(text: string, kind: EscapeKind): string {
    switch (kind) {
        case "json":
            // Escape control characters and backslashes but keep quotes as-is
            // (the surrounding quotes are added by the JSON serializer).
            return [...text]
                .map((ch) => {
                    if (JSON_SHORT_ESCAPES[ch]) return JSON_SHORT_ESCAPES[ch];
                    const code = ch.codePointAt(0) ?? 0;
                    if (code < 0x20) return `\\u${code.toString(16).padStart(4, "0")}`;
                    return ch;
                })
                .join("");
        case "regex":
            return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        case "sql":
            return text.replace(/'/g, "''");
        case "url-query":
            return encodeURIComponent(text);
        default:
            return text;
    }
}

/** Parse the CSV-ish text and render a GitHub-flavored Markdown table. */
export function csvToMarkdownTable(text: string): string {
    const rows = text
        .split(/\r?\n/)
        .filter((r) => r.trim() !== "")
        .map((r) => r.split(/ *, */).map((c) => c.trim().replace(/^"|"$/g, "")));
    if (rows.length === 0) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const pad = (cells: string[]) => {
        const out = [...cells];
        while (out.length < width) out.push("");
        return out;
    };
    const header = pad(rows[0]);
    const rest = rows.slice(1).map(pad);
    const lines = [
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
        ...rest.map((r) => `| ${r.join(" | ")} |`),
    ];
    return lines.join("\n");
}

export interface TextCleanerOptions {
    trimLines: boolean;
    collapseSpaces: boolean;
    removeBlankLines: boolean;
    normalizeQuotes: boolean;
    removeTrailingWhitespace?: boolean;
}

export function cleanText(text: string, opts: TextCleanerOptions): string {
    let out = text;
    if (opts.normalizeQuotes) {
        out = out
            .replace(/[\u2018\u2019\u201B]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/\u2026/g, "...")
            .replace(/\u00A0/g, " ");
    }
    if (opts.collapseSpaces) out = out.replace(/[ \t]{2,}/g, " ");
    if (opts.trimLines || opts.removeTrailingWhitespace) out = out.replace(/[ \t]+$/gm, "");
    if (opts.trimLines) out = out.replace(/^[ \t]+/gm, "");
    if (opts.removeBlankLines) out = out.replace(/\n{2,}/g, "\n").replace(/^\n|\n$/g, "");
    return out;
}

/** Classic hex dump: offset · hex bytes · ASCII column. */
export function hexDump(text: string, bytesPerLine = 16): string {
    const bytes = new TextEncoder().encode(text);
    const lines: string[] = [];
    for (let off = 0; off < bytes.length; off += bytesPerLine) {
        const chunk = [...bytes.slice(off, off + bytesPerLine)];
        const hexLeft = chunk.slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join(" ");
        const hexRight = chunk.slice(8).map((b) => b.toString(16).padStart(2, "0")).join(" ");
        const hex = bytesPerLine > 8
            ? `${hexLeft.padEnd(bytesPerLine * 3 - 1, " ")}  ${hexRight}`.trimEnd()
            : hexLeft;
        const ascii = chunk.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
        lines.push(`${off.toString(16).padStart(8, "0")}  ${hex.padEnd(bytesPerLine * 3 - 1)}  |${ascii}|`);
    }
    return lines.join("\n");
}

/** Box-drawing ASCII table from rows (first row = header). */
export function asciiTable(rows: string[][], opts: { align?: "left" | "right" | "center" } = {}): string {
    if (rows.length === 0) return "";
    const cols = Math.max(...rows.map((r) => r.length));
    const width = Array.from({length: cols}, (_, c) =>
        Math.max(0, ...rows.map((r) => (r[c] ?? "").length))
    );
    const cell = (text: string, c: number) => {
        const t = text ?? "";
        const pad = width[c] - t.length;
        if (opts.align === "right") return " ".repeat(pad) + t;
        if (opts.align === "center") {
            const l = Math.floor(pad / 2);
            return " ".repeat(l) + t + " ".repeat(pad - l);
        }
        return t + " ".repeat(pad);
    };
    const sep = (l: string, m: string, r: string) =>
        `${l}${width.map((w) => "─".repeat(w + 2)).join(m)}${r}`;
    const out: string[] = [];
    out.push(sep("┌", "┬", "┐"));
    out.push(`│ ${rows[0].map((cellV, c) => cell(cellV, c)).join(" │ ")} │`);
    out.push(sep("├", "┼", "┤"));
    for (const r of rows.slice(1)) {
        const cells = Array.from({length: cols}, (_, c) => cell(r[c] ?? "", c));
        out.push(`│ ${cells.join(" │ ")} │`);
    }
    out.push(sep("└", "┴", "┘"));
    return out.join("\n");
}

/* ── Time / duration ──────────────────────────────────────────────── */

/** Humanize milliseconds: compact form like 1h30m, 1s500ms, 0ms. */
export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms)) return "—";
    const neg = ms < 0;
    let t = Math.abs(Math.round(ms));
    const units: Array<[number, string]> = [
        [86400000, "d"],
        [3600000, "h"],
        [60000, "m"],
        [1000, "s"],
    ];
    const parts: string[] = [];
    for (const [size, label] of units) {
        if (t >= size) {
            parts.push(`${Math.floor(t / size)}${label}`);
            t %= size;
        }
    }
    if (parts.length === 0 || t > 0) parts.push(`${t}ms`);
    return (neg ? "-" : "") + parts.join("");
}

const DURATION_TOKENS = /(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?|w|weeks?)/gi;

/** Parse "1h 30m 5s" / "90 s" / "2 days" into milliseconds. */
export function parseDuration(text: string): number | null {
    let total = 0;
    let matched = false;
    for (const m of text.matchAll(DURATION_TOKENS)) {
        matched = true;
        const n = parseFloat(m[1]);
        const unit = m[2].toLowerCase();
        const mult =
            unit === "ms" ? 1 :
                unit === "s" || unit.startsWith("sec") ? 1000 :
                    unit === "m" || unit.startsWith("min") ? 60000 :
                        unit === "h" || unit.startsWith("hr") || unit.startsWith("hour") ? 3600000 :
                            unit.startsWith("d") || unit.startsWith("day") ? 86400000 :
                                unit.startsWith("w") || unit.startsWith("week") ? 604800000 :
                                    0;
        total += n * mult;
    }
    if (/^\s*\d+(?:\.\d+)?\s*$/.test(text) && text.trim() !== "") {
        return parseFloat(text) * 1000; // bare number = seconds
    }
    return matched ? total : null;
}

/* ── Semver ────────────────────────────────────────────────────────── */

export interface Semver {
    major: number;
    minor: number;
    patch: number;
    prerelease: string[];
}

export function parseSemver(input: string): Semver | null {
    const m =
        /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(input.trim());
    if (!m) return null;
    return {
        major: Number(m[1]),
        minor: Number(m[2]),
        patch: Number(m[3]),
        prerelease: m[4] ? m[4].split(".") : [],
    };
}

export function compareSemver(a: Semver, b: Semver): number {
    for (const k of ["major", "minor", "patch"] as const) {
        if (a[k] !== b[k]) return a[k] - b[k];
    }
    const ap = a.prerelease;
    const bp = b.prerelease;
    if (ap.length === 0 && bp.length === 0) return 0;
    if (ap.length === 0) return 1; // release > prerelease
    if (bp.length === 0) return -1;
    for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
        const x = ap[i];
        const y = bp[i];
        if (x === undefined) return -1;
        if (y === undefined) return 1;
        const xn = /^\d+$/.test(x) ? Number(x) : null;
        const yn = /^\d+$/.test(y) ? Number(y) : null;
        if (xn !== null && yn !== null) {
            if (xn !== yn) return xn - yn;
        } else if (xn !== null) return -1;
        else if (yn !== null) return 1;
        else if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
}

/** Check a version against a simple range: =, >, >=, <, <=, ^, ~. */
export function semverSatisfies(range: string, version: string): boolean {
    const v = parseSemver(version);
    if (!v) return false;
    const m = /^(>=|<=|>|<|=|\^|~)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(range.trim());
    if (!m) return false;
    const op = m[1] ?? "=";
    const target: Semver = {
        major: Number(m[2]),
        minor: m[3] !== undefined ? Number(m[3]) : 0,
        patch: m[4] !== undefined ? Number(m[4]) : 0,
        prerelease: [],
    };
    const cmp = compareSemver(v, target);
    switch (op) {
        case "=":
            return cmp === 0;
        case ">":
            return cmp > 0;
        case ">=":
            return cmp >= 0;
        case "<":
            return cmp < 0;
        case "<=":
            return cmp <= 0;
        case "^": // same major, at or after the target
            return v.major === target.major && cmp >= 0;
        case "~": // same major + minor (when the minor was written)
            return (
                v.major === target.major &&
                (m[3] === undefined || v.minor === target.minor) &&
                cmp >= 0
            );
        default:
            return false;
    }
}

/* ── chmod calculator ──────────────────────────────────────────────── */

/** "754" (or 0o754) → "rwxr-xr--". */
export function chmodToSymbolic(octal: string): string {
    const digits = octal.replace(/^0o?/, "").replace(/\D/g, "").padStart(3, "0").slice(-3);
    const bit = (n: number, mask: number, chars: [string, string]) =>
        (n & mask) !== 0 ? chars[0] : chars[1];
    return [...digits].map((d) => {
        const n = Number(d);
        return `${bit(n, 4, ["r", "-"])}${bit(n, 2, ["w", "-"])}${bit(n, 1, ["x", "-"])}`;
    }).join("");
}

/** "rwxr-xr--" (or "rwxr-xr-t" incl. setuid bits) → octal digits. */
export function chmodFromSymbolic(symbolic: string): string {
    const s = symbolic.replace(/[^rwxst-]/g, "").padEnd(9, "-").slice(0, 9);
    const group = (chunk: string) =>
        (chunk[0] === "r" ? 4 : 0) + (chunk[1] === "w" ? 2 : 0) + (chunk[2] === "x" || chunk[2] === "s" || chunk[2] === "t" ? 1 : 0);
    return [s.slice(0, 3), s.slice(3, 6), s.slice(6, 9)].map(group).join("");
}

/* ── Roman numerals ────────────────────────────────────────────────── */

const ROMAN_PAIRS: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function toRoman(n: number): string {
    if (!Number.isInteger(n) || n <= 0 || n > 3999) throw new Error("1-3999 only");
    let out = "";
    let v = n;
    for (const [val, sym] of ROMAN_PAIRS) {
        while (v >= val) {
            out += sym;
            v -= val;
        }
    }
    return out;
}

export function fromRoman(s: string): number {
    const values: Record<string, number> = {I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000};
    const t = s.trim().toUpperCase();
    if (!/^[MDCLXVI]+$/.test(t)) throw new Error("not a Roman numeral");
    let total = 0;
    for (let i = 0; i < t.length; i++) {
        const cur = values[t[i]];
        const next = values[t[i + 1]] ?? 0;
        total += cur < next ? -cur : cur;
    }
    // Round-trip guard: reject non-canonical forms like "IIII".
    if (toRoman(total) !== t) throw new Error("non-canonical Roman numeral");
    return total;
}

/* ── Morse + NATO ──────────────────────────────────────────────────── */

const MORSE: Record<string, string> = {
    A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.",
    H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.",
    O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-",
    V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
    "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
    ".": ".-.-.-", ",": "--..--", "?": "..--..", "!": "-.-.--", "/": "-..-.",
    "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...", ";": "-.-.-.",
    "=": "-...-", "+": ".-.-.", "-": "-....-", '"': ".-..-.", "'": ".----.",
    "@": ".--.-.",
};

const MORSE_REVERSE: Record<string, string> = Object.fromEntries(
    Object.entries(MORSE).map(([k, v]) => [v, k])
);

export function morseEncode(text: string): string {
    return [...text.toUpperCase()]
        .map((c) => (c === " " ? "/" : MORSE[c] ?? ""))
        .filter((s) => s !== "")
        .join(" ");
}

export function morseDecode(text: string): string {
    return text
        .trim()
        .split(/\s+/)
        .map((tok) => {
            if (tok === "/") return " ";
            if (!/^[.-]+$/.test(tok)) return "";
            return MORSE_REVERSE[tok] ?? "";
        })
        .join("");
}

const NATO: Record<string, string> = {
    A: "Alfa", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot",
    G: "Golf", H: "Hotel", I: "India", J: "Juliett", K: "Kilo", L: "Lima",
    M: "Mike", N: "November", O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo",
    S: "Sierra", T: "Tango", U: "Uniform", V: "Victor", W: "Whiskey",
    X: "X-ray", Y: "Yankee", Z: "Zulu", "0": "Zero", "1": "One", "2": "Two",
    "3": "Three", "4": "Four", "5": "Five", "6": "Six", "7": "Seven",
    "8": "Eight", "9": "Nine",
};

export function toNato(text: string): string {
    return [...text.toUpperCase()]
        .map((c) => (c === " " ? "(space)" : NATO[c] ?? c))
        .join(" ");
}

/* ── Color contrast (WCAG) ─────────────────────────────────────────── */

function srgbChannel(v: number): number {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(r: number, g: number, b: number): number {
    return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

export function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
    const la = relativeLuminance(a.r, a.g, a.b);
    const lb = relativeLuminance(b.r, b.g, b.b);
    const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    return Math.round(ratio * 100) / 100;
}

export function wcagRating(ratio: number): string {
    if (ratio >= 7) return "AAA (normal + large text)";
    if (ratio >= 4.5) return "AA (normal + large text)";
    if (ratio >= 3) return "AA large text only";
    return "fail";
}

/* ── CSS generators ────────────────────────────────────────────────── */

export interface GradientStop {
    color: string;
    position?: number; // %
}

/** Build a CSS `linear-gradient(...)` string. */
export function cssLinearGradient(angle: number, stops: GradientStop[]): string {
    const parts = stops.map(
        (s) => `${s.color}${typeof s.position === "number" ? ` ${Math.round(s.position)}%` : ""}`
    );
    return `linear-gradient(${Math.round(angle)}deg, ${parts.join(", ")})`;
}

export interface BoxShadowOptions {
    x: number;
    y: number;
    blur: number;
    spread: number;
    color: string;
    inset: boolean;
}

export function cssBoxShadow(opts: BoxShadowOptions, layers = 1): string {
    const layer = (scale: number) =>
        `${opts.inset ? "inset " : ""}${Math.round(opts.x * scale)}px ${Math.round(opts.y * scale)}px ${Math.round(opts.blur * scale)}px ${Math.round(opts.spread * scale)}px ${opts.color}`;
    if (layers <= 1) return layer(1);
    return Array.from({length: layers}, (_, i) => layer(1 + i * 0.6)).join(", ");
}

/** SVG placeholder image generator (data-URI friendly). */
export function svgPlaceholder(opts: {
    width: number;
    height: number;
    bg?: string;
    fg?: string;
    text?: string;
}): string {
    const {width, height} = opts;
    const bg = opts.bg ?? "#10b981";
    const fg = opts.fg ?? "#ffffff";
    const label = (opts.text ?? `${width}×${height}`)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const fontSize = Math.max(10, Math.round(Math.min(width, height) / 6));
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">`,
        `<rect width="${width}" height="${height}" fill="${bg}"/>`,
        `<text x="50%" y="50%" fill="${fg}" font-family="system-ui, sans-serif" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${label}</text>`,
        `</svg>`,
    ].join("");
}

/* ── Subnet calculator (IPv4) ─────────────────────────────────────── */

export interface SubnetFacts {
    address: string;
    mask: string;
    cidr: string;
    network: string;
    broadcast: string;
    firstHost: string;
    lastHost: string;
    hosts: number;
    prefix: number;
    class: string;
    private: boolean;
}

export function parseSubnet(cidrInput: string): SubnetFacts | null {
    const t = cidrInput.trim();
    const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/.exec(t);
    if (!m) return null;
    const octets = m[1].split(".").map(Number);
    if (octets.some((o) => o > 255)) return null;
    const prefix = m[2] !== undefined ? Number(m[2]) : 24;
    if (prefix > 32) return null;
    const ipNum =
        ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
    const maskNum = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = (ipNum & maskNum) >>> 0;
    const broadcast = (network | (~maskNum >>> 0)) >>> 0;
    const ip = (n: number) => [(n >>> 24), (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
    const hostBits = 32 - prefix;
    const usable =
        hostBits > 1 ? Math.pow(2, hostBits) - 2 : hostBits === 1 ? 2 : 1;
    const first = hostBits > 1 ? network + 1 : network;
    const last = hostBits > 1 ? broadcast - 1 : broadcast;
    const firstOctet = octets[0];
    const cls =
        firstOctet < 128 ? "A" :
            firstOctet < 192 ? "B" :
                firstOctet < 224 ? "C" :
                    firstOctet < 240 ? "D (multicast)" : "E (reserved)";
    const isPrivate =
        firstOctet === 10 ||
        (firstOctet === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (firstOctet === 192 && octets[1] === 168) ||
        firstOctet === 127;
    return {
        address: m[1],
        mask: ip(maskNum),
        cidr: `${ip(network)}/${prefix}`,
        network: ip(network),
        broadcast: ip(broadcast),
        firstHost: ip(first),
        lastHost: ip(last),
        hosts: usable,
        prefix,
        class: cls,
        private: isPrivate,
    };
}

/* ── JSON → TypeScript types ─────────────────────────────────────── */

/** Convert a parsed JSON value into a TypeScript declaration block. */
export function jsonToTypes(value: unknown, name = "Root"): string {
    const tsTypeOf = (v: unknown): string => {
        if (v === null) return "null";
        if (Array.isArray(v)) {
            if (v.length === 0) return "unknown[]";
            const types = [...new Set(v.map(tsTypeOf))];
            return types.length === 1 ? `${types[0]}[]` : `Array<${types.join(" | ")}>`;
        }
        if (typeof v === "object") return "OBJECT";
        if (typeof v === "string") return "string";
        if (typeof v === "boolean") return "boolean";
        return "number";
    };
    const interfaces: string[] = [];
    const seen = new Map<unknown, string>();
    const keyOf = (k: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : JSON.stringify(k));
    const emit = (v: unknown, n: string): string => {
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
            const existing = seen.get(v);
            if (existing) return existing;
            seen.set(v, n);
            const lines: string[] = [];
            for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
                const childName = `${n}${k[0].toUpperCase()}${k.slice(1)}`.replace(/[^A-Za-z0-9_]/g, "");
                const t = emit(child, childName);
                const opt = child === undefined ? "?" : "";
                lines.push(`  ${keyOf(k)}${opt}: ${t};`);
            }
            interfaces.push(`export interface ${n} {\n${lines.join("\n")}\n}`);
            return n;
        }
        if (Array.isArray(v)) {
            const inner = [...new Set(v.map((x) => emit(x, `${n}Item`)))];
            return inner.length === 1 ? `${inner[0]}[]` : `Array<${inner.join(" | ")}>`;
        }
        return tsTypeOf(v);
    };
    emit(value, name);
    return interfaces.join("\n\n");
}

/* ── .gitignore generator ─────────────────────────────────────────── */

export const GITIGNORE_TEMPLATES: Array<{ id: string; label: string; body: string }> = [
    {
        id: "node",
        label: "Node.js",
        body: `node_modules/\nnpm-debug.log*\nyarn-debug.log*\nyarn-error.log*\n.env\n.env.*\n!.env.example\ndist/\nbuild/\n.next/\ncoverage/\n.nyc_output/\n*.log\n.DS_Store\n`,
    },
    {
        id: "python",
        label: "Python",
        body: `__pycache__/\n*.py[cod]\n*.egg-info/\n.eggs/\nbuild/\ndist/\n.venv/\nvenv/\nenv/\n.pytest_cache/\n.mypy_cache/\n.coverage\nhtmlcov/\n.tox/\n.ipynb_checkpoints/\n`,
    },
    {
        id: "venv-conda",
        label: "Python + conda + Notebooks",
        body: `__pycache__/\n*.py[cod]\n.venv/\nvenv/\nenv/\n.conda/\n.ipynb_checkpoints/\n*.egg-info/\ndist/\nbuild/\n.pytest_cache/\n.mypy_cache/\n.ruff_cache/\n.coverage\nhtmlcov/\n`,
    },
    {
        id: "jupyter",
        label: "Jupyter / Data Science",
        body: `.ipynb_checkpoints/\n*.ipynb_checkpoints\n.nb_meta.json\n.data/\noutputs/\n*.tmp\n.DS_Store\n__pycache__/\n*.py[cod]\n.venv/\n`,
    },
    {
        id: "ide",
        label: "Editors & OS",
        body: `.idea/\n.vscode/*\n!.vscode/settings.json\n!.vscode/extensions.json\n*.sublime-*\n.DS_Store\nThumbs.db\ndesktop.ini\n*.swp\n*.swo\n`,
    },
    {
        id: "go",
        label: "Go",
        body: `*.exe\n*.exe~\n*.dll\n*.so\n*.dylib\n*.test\n*.out\ngo.sum\n/bin/\n/vendor/\n`,
    },
    {
        id: "rust",
        label: "Rust",
        body: `/target\n**/*.rs.bk\nCargo.lock\n`,
    },
    {
        id: "praxis",
        label: "Praxis Workspace",
        body: `.praxis/appearance.json\n*.praxis-session\noutputs/\nfigures-cache/\n`,
    },
];

/** Merge selected templates (deduped, sections labelled). */
export function buildGitignore(selectedIds: string[]): string {
    const picked = GITIGNORE_TEMPLATES.filter((t) => selectedIds.includes(t.id));
    if (picked.length === 0) return "";
    const seen = new Set<string>();
    const sections = picked.map((t) => {
        const lines = t.body
            .split("\n")
            .filter((l) => l.trim() !== "")
            .filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
        return `# ${t.label}\n${lines.join("\n")}`;
    });
    return sections.join("\n\n") + "\n";
}

/* ── dotenv formatter ─────────────────────────────────────────────── */

export interface DotenvLine {
    key: string;
    value: string;
    comment: string;
    blank: boolean;
}

export function parseDotenv(text: string): DotenvLine[] {
    return text.replace(/\r\n?/g, "\n").split("\n").map((line) => {
        if (line.trim() === "") return {key: "", value: "", comment: "", blank: true};
        if (line.trim().startsWith("#")) return {key: "", value: "", comment: line.trim(), blank: false};
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/.exec(line);
        if (!m) return {key: "", value: line.trim(), comment: "", blank: false};
        let value = m[2].trim();
        const inline = value.indexOf(" #");
        let comment = "";
        if (inline > 0 && !/^["']/.test(value)) {
            comment = value.slice(inline + 1).trim();
            value = value.slice(0, inline).trim();
        }
        if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
        return {key: m[1], value, comment, blank: false};
    });
}

export function formatDotenv(
    text: string,
    opts: { sort: boolean; uppercase: boolean; quote: boolean; groupBlank: boolean }
): string {
    const parsed = parseDotenv(text);
    let entries = parsed.filter((l) => !l.blank && l.key !== "");
    if (opts.uppercase) entries = entries.map((e) => ({...e, key: e.key.toUpperCase()}));
    if (opts.sort) entries.sort((a, b) => a.key.localeCompare(b.key));
    const lines = entries.map((e) => {
        const v = opts.quote && e.value !== "" && /\s/.test(e.value) ? `"${e.value}"` : e.value;
        const c = e.comment ? ` # ${e.comment.replace(/^#\s*/, "")}` : "";
        return `${e.key}=${v}${c}`;
    });
    if (opts.groupBlank) {
        // separate annotated groups with one blank line
        const out: string[] = [];
        let lastHadComment = false;
        for (const l of lines) {
            const hasComment = / # .+$/.test(l);
            if (hasComment && lastHadComment === false && out.length > 0) out.push("");
            out.push(l);
            lastHadComment = hasComment;
        }
        return out.join("\n") + "\n";
    }
    return lines.join("\n") + "\n";
}

/* ── Reference tables ─────────────────────────────────────────────── */

export const HTTP_STATUSES: Array<{ code: number; phrase: string; group: string; note: string }> = [
    {
        code: 100,
        phrase: "Continue",
        group: "1xx informational",
        note: "The client should continue with the rest of the request."
    },
    {
        code: 101,
        phrase: "Switching Protocols",
        group: "1xx informational",
        note: "Protocol upgrade (e.g. to WebSocket)."
    },
    {code: 200, phrase: "OK", group: "2xx success", note: "The request succeeded."},
    {code: 201, phrase: "Created", group: "2xx success", note: "A resource was created — check the Location header."},
    {code: 202, phrase: "Accepted", group: "2xx success", note: "Queued for processing, not complete yet."},
    {code: 204, phrase: "No Content", group: "2xx success", note: "Success with an empty body."},
    {code: 206, phrase: "Partial Content", group: "2xx success", note: "Range request satisfied."},
    {code: 301, phrase: "Moved Permanently", group: "3xx redirection", note: "The URL moved — update your bookmark."},
    {code: 302, phrase: "Found", group: "3xx redirection", note: "Temporary redirect."},
    {
        code: 304,
        phrase: "Not Modified",
        group: "3xx redirection",
        note: "Cached copy is fresh (ETag/If-Modified-Since)."
    },
    {code: 307, phrase: "Temporary Redirect", group: "3xx redirection", note: "Like 302 but keeps the method."},
    {code: 308, phrase: "Permanent Redirect", group: "3xx redirection", note: "Like 301 but keeps the method."},
    {code: 400, phrase: "Bad Request", group: "4xx client error", note: "Malformed syntax / invalid payload."},
    {code: 401, phrase: "Unauthorized", group: "4xx client error", note: "Authentication missing or failed."},
    {code: 403, phrase: "Forbidden", group: "4xx client error", note: "Authenticated but not allowed."},
    {code: 404, phrase: "Not Found", group: "4xx client error", note: "No resource at this URI."},
    {code: 405, phrase: "Method Not Allowed", group: "4xx client error", note: "The verb is wrong for this resource."},
    {code: 409, phrase: "Conflict", group: "4xx client error", note: "State conflict (e.g. duplicate create)."},
    {code: 410, phrase: "Gone", group: "4xx client error", note: "Permanently removed."},
    {
        code: 415,
        phrase: "Unsupported Media Type",
        group: "4xx client error",
        note: "The Content-Type is not supported."
    },
    {code: 422, phrase: "Unprocessable Entity", group: "4xx client error", note: "Semantically invalid payload."},
    {code: 429, phrase: "Too Many Requests", group: "4xx client error", note: "Rate-limited — honor Retry-After."},
    {code: 500, phrase: "Internal Server Error", group: "5xx server error", note: "The server broke — check its logs."},
    {code: 502, phrase: "Bad Gateway", group: "5xx server error", note: "An upstream dependency failed."},
    {code: 503, phrase: "Service Unavailable", group: "5xx server error", note: "Overloaded or down for maintenance."},
    {code: 504, phrase: "Gateway Timeout", group: "5xx server error", note: "The upstream took too long."},
];

export const MIME_TYPES: Array<{ ext: string; type: string; note: string }> = [
    {ext: ".txt", type: "text/plain", note: "Plain text"},
    {ext: ".html", type: "text/html", note: "HTML document"},
    {ext: ".css", type: "text/css", note: "Stylesheet"},
    {ext: ".js", type: "text/javascript", note: "Classic script"},
    {ext: ".mjs", type: "text/javascript", note: "ES module script"},
    {ext: ".json", type: "application/json", note: "JSON document"},
    {ext: ".jsonl", type: "application/x-ndjson", note: "Newline-delimited JSON"},
    {ext: ".csv", type: "text/csv", note: "Comma-separated values"},
    {ext: ".tsv", type: "text/tab-separated-values", note: "Tab-separated values"},
    {ext: ".xml", type: "application/xml", note: "XML document"},
    {ext: ".md", type: "text/markdown", note: "Markdown"},
    {ext: ".yaml/.yml", type: "application/yaml", note: "YAML config"},
    {ext: ".toml", type: "application/toml", note: "TOML config"},
    {ext: ".png", type: "image/png", note: "Raster image (lossless)"},
    {ext: ".jpg/.jpeg", type: "image/jpeg", note: "Photograph (lossy)"},
    {ext: ".gif", type: "image/gif", note: "Animated image"},
    {ext: ".webp", type: "image/webp", note: "Modern raster"},
    {ext: ".svg", type: "image/svg+xml", note: "Vector image"},
    {ext: ".ico", type: "image/x-icon", note: "Favicon"},
    {ext: ".mp3", type: "audio/mpeg", note: "Audio"},
    {ext: ".ogg", type: "audio/ogg", note: "Audio"},
    {ext: ".wav", type: "audio/wav", note: "Uncompressed audio"},
    {ext: ".mp4", type: "video/mp4", note: "Video"},
    {ext: ".webm", type: "video/webm", note: "Video"},
    {ext: ".pdf", type: "application/pdf", note: "PDF document"},
    {ext: ".zip", type: "application/zip", note: "Archive"},
    {ext: ".gz", type: "application/gzip", note: "Gzip archive"},
    {ext: ".tar", type: "application/x-tar", note: "Tar archive"},
    {ext: ".py", type: "text/x-python", note: "Python source"},
    {ext: ".ipynb", type: "application/x-ipynb+json", note: "Jupyter notebook"},
    {ext: ".db/.sqlite", type: "application/x-sqlite3", note: "SQLite database"},
    {ext: ".parquet", type: "application/vnd.apache.parquet", note: "Columnar table"},
    {ext: ".feather", type: "application/vnd.apache.arrow+binary", note: "Arrow IPC table"},
];
