"use client";

/**
 * tool-validate.tsx — the "Validators" toolbox category (base tools;
 * the registry's boosts keep the category ≥ 30 — see dev-toolbox.tsx).
 * Syntax + checksum validators with the reason printed on every line
 * (pass or fail). All offline, all deterministic.
 */

import {makeTextTool, type TextToolSpec} from "./tool-factory";
import {nextCronRuns, parseCron} from "@/lib/cron";
import {semverSatisfies} from "@/lib/toolbox-more";

const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_BLOCK = "[0-9A-Fa-f]{1,4}";
const IPV6_RE = new RegExp(
    `^((?:${IPV6_BLOCK}:){7}(?:${IPV6_BLOCK}|:)|` +
    `(?:${IPV6_BLOCK}:){6}(?::${IPV6_BLOCK}|:((?:${IPV6_BLOCK})?(?::${IPV6_BLOCK}){0,4}(?::(?:[0-9A-Fa-f]{1,4}){1,3}(?::|$)|(?=::$)))|:)|` +
    `(?:${IPV6_BLOCK}:){5}(?::((?:${IPV6_BLOCK})?(?::${IPV6_BLOCK}){0,4}(?::(?:[0-9A-Fa-f]{1,4}){1,3}(?::|$)|(?=::$)))|:)|` +
    `(?:${IPV6_BLOCK}:){4}(?::(?:(?:${IPV6_BLOCK})?(?::${IPV6_BLOCK}){0,3}(?::(?:[0-9A-Fa-f]{1,4}){1,4}(?::|$)|(?=::$)))|(?::${IPV6_BLOCK}){1,2}|:)|` +
    `(?:${IPV6_BLOCK}:){3}(?::(?:(?:${IPV6_BLOCK})?(?::${IPV6_BLOCK}){0,2}(?::(?:[0-9A-Fa-f]{1,4}){1,5}(?::|$)|(?=::$)))|(?::${IPV6_BLOCK}){1,3}|:)|` +
    `(?:${IPV6_BLOCK}:){2}(?::(?:(?:${IPV6_BLOCK})?(?::${IPV6_BLOCK}){0,1}(?::(?:[0-9A-Fa-f]{1,4}){1,6}(?::|$)|(?=::$)))|(?::${IPV6_BLOCK}){1,4}|:)|` +
    `(?:${IPV6_BLOCK}:){1}(?::(?:(?:${IPV6_BLOCK})?(?::(?:[0-9A-Fa-f]{1,4}){1,7}(?::|$)|(?=::$)))|(?::${IPV6_BLOCK}){1,5}|:)|` +
    `(?::(?:(?:${IPV6_BLOCK})?(?::(?:[0-9A-Fa-f]{1,4}){1,7}(?::|$)|(?=::$)))|(?::${IPV6_BLOCK}){1,6}|:))$`,
    "i"
);
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const HEXCOLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const PHONE_E164_RE = /^\+[1-9]\d{7,14}$/;
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

const luhnValid = (digits: string): boolean => {
    if (!/^\d+$/.test(digits)) return false;
    let sum = 0;
    for (let i = digits.length - 1, k = 0; i >= 0; i--, k++) {
        let v = digits.charCodeAt(i) - 48;
        if (k >= 1) {
            v *= 2;
            if (v > 9) v -= 9;
        }
        sum += v;
    }
    return sum % 10 === 0;
};

const cardBrand = (digits: string): string => {
    if (/^4/.test(digits)) return "Visa";
    if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
    if (/^3[47]/.test(digits)) return "American Express";
    if (/^6(?:011|5)/.test(digits)) return "Discover";
    if (/^35/.test(digits)) return "JCB";
    if (/^3(?:0[0-5]|[68])/.test(digits)) return "Diners Club";
    return "unknown brand";
};

export const VALIDATE_TOOLS: TextToolSpec[] = [
    {
        id: "val-json",
        label: "JSON Lint",
        description: "Parse JSON and pinpoint the first error's line/column — or pretty-print the parsed shape.",
        sample: '{"a": 1, "b": [2, 3}',
        transform: (input) => {
            try {
                const data = JSON.parse(input);
                const shape = (v: unknown): string => {
                    if (Array.isArray(v)) return `array(${v.length})`;
                    if (v === null) return "null";
                    if (typeof v === "object") {
                        const entries = Object.entries(v as Record<string, unknown>);
                        return `object{${entries.slice(0, 5).map(([k, val]) => `${k}: ${shape(val)}`).join(", ")}${entries.length > 5 ? ", …" : ""}}`;
                    }
                    return typeof v;
                };
                return `VALID JSON · ${shape(data)}`;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const pos = msg.match(/position (\d+)/);
                if (pos) {
                    const upto = input.slice(0, Number(pos[1]));
                    const line = upto.split("\n").length;
                    const col = upto.length - upto.lastIndexOf("\n");
                    return `INVALID — ${msg}\n  at line ${line}, column ${col}`;
                }
                return `INVALID — ${msg}`;
            }
        },
    },
    {
        id: "val-xml",
        label: "XML Lint (DOMParser)",
        description: "The browser's own XML parser reports the first structural error with its position.",
        sample: "<root><a>1</a><b>2</root>",
        transform: (input) => {
            const doc = new DOMParser().parseFromString(input, "application/xml");
            const err = doc.querySelector("parsererror");
            if (err) return `INVALID XML\n${err.textContent?.trim().split("\n").slice(0, 4).join("\n")}`;
            const elems = doc.querySelectorAll("*").length;
            return `VALID XML · ${elems} element(s) · root <${doc.documentElement?.tagName}>`;
        },
    },
    {
        id: "val-html-balance",
        label: "HTML Tag Balance",
        description: "Stack-check the opening/closing tags of an HTML fragment (void elements known).",
        sample: "<div><p>hi</p></span>",
        transform: (input) => {
            const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
            const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
            const stack: Array<{ tag: string; index: number }> = [];
            const errors: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = re.exec(input)) !== null) {
                const tag = m[1].toLowerCase();
                const closing = m[0].startsWith("</");
                const selfClosed = m[2] === "/";
                if (closing) {
                    const last = stack[stack.length - 1];
                    if (!last) errors.push(`</${tag}> with nothing open (offset ${m.index})`);
                    else if (last.tag !== tag) {
                        errors.push(`</${tag}> but <${last.tag}> is open (opened at offset ${last.index})`);
                        stack.pop();
                    } else stack.pop();
                } else if (!selfClosed && !VOID.has(tag)) {
                    stack.push({tag, index: m.index});
                }
            }
            for (const open of stack) errors.push(`<${open.tag}> never closed (opened at offset ${open.index})`);
            return errors.length === 0
                ? "BALANCED — every opened tag is closed."
                : `${errors.length} problem(s):\n${errors.map((e) => `  • ${e}`).join("\n")}`;
        },
        note: "Text-level checks (attributes, entities) stay with the HTML beautifier / entity tools.",
    },
    {
        id: "val-email",
        label: "Email Syntax Check",
        description: "RFC-flavored address syntax per line — with the specific reason when it fails.",
        sample: "user@example.com\nbad@@example\nno-at.sign",
        transform: (input) =>
            input.split(/[\n;,\s]+/).filter(Boolean).map((addr) => {
                if (addr.length > 254) return `${addr} → FAIL (longer than 254 chars)`;
                if (!addr.includes("@")) return `${addr} → FAIL (no @)`;
                const [local, domain] = addr.split("@");
                if (!local) return `${addr} → FAIL (empty local part)`;
                if (local.length > 64) return `${addr} → FAIL (local part > 64 chars)`;
                if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return `${addr} → FAIL (bad dot placement in local part)`;
                if (!domain.includes(".")) return `${addr} → FAIL (domain has no dot)`;
                if (!EMAIL_RE.test(addr)) return `${addr} → FAIL (characters or domain shape)`;
                return `${addr} → OK`;
            }).join("\n"),
        note: "Syntax only — mailbox existence is not (and cannot be) checked offline.",
    },
    {
        id: "val-ipv4",
        label: "IPv4 Validator",
        description: "Octet check plus the address's class / private / loopback classification.",
        sample: "192.168.1.1\n8.8.8.8\n300.1.1.1",
        transform: (input) =>
            input.split(/[\s,;]+/).filter(Boolean).map((ip) => {
                if (!IPV4_RE.test(ip)) return `${ip} → FAIL (octets must be 0–255, exactly four)`;
                const [a] = ip.split(".").map(Number);
                const cls = a < 128 ? "A" : a < 192 ? "B" : a < 224 ? "C" : a < 240 ? "D (multicast)" : "E (reserved)";
                const priv = /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
                const loop = /^127\./.test(ip);
                const net169 = /^169\.254\./.test(ip);
                return `${ip} → OK · class ${cls}${priv ? " · private" : ""}${loop ? " · loopback" : ""}${net169 ? " · link-local" : ""}`;
            }).join("\n"),
    },
    {
        id: "val-ipv6",
        label: "IPv6 Validator",
        description: "Full IPv6 shape check (compression rules + embedded IPv4), with the expanded form printed.",
        sample: "2001:db8::1\n::ffff:192.168.1.1\n12345::",
        transform: (input) =>
            input.split(/[\s,;]+/).filter(Boolean).map((raw) => {
                const ip = raw.replace(/^\[|\]$/g, "");
                let v4Suffix: string | null = null;
                let body = ip;
                if (ip.includes(".")) {
                    const m = ip.match(/^(.*):((?:\d{1,3}\.){3}\d{1,3})$/);
                    if (!m) return `${raw} → FAIL (dotted part must be the last 32 bits)`;
                    v4Suffix = m[2];
                    body = m[1];
                    if (!IPV4_RE.test(v4Suffix)) return `${raw} → FAIL (embedded IPv4 octets out of range)`;
                }
                if (!IPV6_RE.test(body)) return `${raw} → FAIL (blocks/compression shape)`;
                const colons = (body.match(/:/g) ?? []).length;
                const dbl = body.includes("::");
                if (colons > 7 && !dbl) return `${raw} → FAIL (more than 8 groups)`;
                if (body.split("::").length > 2) return `${raw} → FAIL (more than one ::)`;
                const groups = body === "::" ? [] : body.replace(/^::|::$/g, (x) => (x === "::" ? ":" : x)).split(":").filter(Boolean);
                if (!dbl && groups.length !== 8) return `${raw} → FAIL (${groups.length} groups without ::)`;
                return `${raw} → OK${v4Suffix ? " · IPv4-mapped tail" : ""}`;
            }).join("\n"),
    },
    {
        id: "val-mac",
        label: "MAC Address Check",
        description: "Validate and normalize hardware addresses (colon or dash style).",
        sample: "AA:BB:CC:DD:EE:FF\naabb.ccdd.eeff\nAA-BB-CC-DD-EE",
        transform: (input) =>
            input.split(/[\s,;]+/).filter(Boolean).map((mac) => {
                if (MAC_RE.test(mac)) return `${mac} → OK · EUI-48`;
                const dots = /^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$/.test(mac);
                if (dots) return `${mac} → OK (cisco dotted) · normalized ${mac.replace(/\./g, "").replace(/(..)/g, "$1:").replace(/:$/, "")}`;
                return `${mac} → FAIL (need 12 hex digits: AA:BB:CC:DD:EE:FF)`;
            }).join("\n"),
    },
    {
        id: "val-uuid",
        label: "UUID Validator",
        description: "Shape + RFC version/variant decode of every UUID.",
        sample: "550e8400-e29b-41d4-a716-446655440000",
        transform: (input) =>
            input.split(/[\s,;]+/).filter(Boolean).map((u) => {
                if (!UUID_RE.test(u)) return `${u} → FAIL (need 8-4-4-4-12 hex)`;
                const version = parseInt(u[14], 16);
                const variantNibble = parseInt(u[19], 16);
                const variant = variantNibble >= 8 && variantNibble <= 0xb ? "RFC 4122" : variantNibble >= 0xc ? "Microsoft" : "reserved (NCS)";
                return `${u} → OK · version ${version} · variant ${variant}`;
            }).join("\n"),
    },
    {
        id: "val-credit",
        label: "Card Number Check",
        description: "Luhn + brand + length expectations for card numbers (test input, not real data).",
        sample: "4111111111111111",
        transform: (input) =>
            input.split(/[\s-]+/).filter(Boolean).map((raw) => {
                const digits = raw.replace(/\D/g, "");
                if (digits.length < 12 || digits.length > 19) return `${raw} → FAIL (length 12–19)`;
                const brand = cardBrand(digits);
                if (!luhnValid(digits)) return `${digits} → FAIL (Luhn) · looks like ${brand}`;
                return `${digits} → OK (Luhn) · ${brand} · ${digits.length} digits`;
            }).join("\n"),
    },
    {
        id: "val-phone",
        label: "Phone (E.164) Check",
        description: "Canonical +phone-number syntax per line, with a normalized version.",
        sample: "+201234567890\n+44 20 7946 0958\n12345",
        transform: (input) =>
            input.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
                const phone = line.trim();
                const norm = "+" + phone.replace(/[^\d]/g, "");
                if (phone.startsWith("+")) {
                    if (PHONE_E164_RE.test(norm)) return `${phone} → OK · normalized ${norm}`;
                    return `${phone} → FAIL (E.164: + then 8–15 digits, no leading 0)`;
                }
                return `${phone} → FAIL (missing + country prefix) · would be ${norm} after normalization`;
            }).join("\n"),
    },
    {
        id: "val-hexcolor",
        label: "Color Notation Check",
        description: "Hex color shapes (#RGB / #RGBA / #RRGGBB / #RRGGBBAA) plus the RGB triple it decodes to.",
        sample: "#0F7\n#10b981\n#10b98180",
        transform: (input) =>
            input.split(/[\s,;]+/).filter(Boolean).map((c) => {
                if (!HEXCOLOR_RE.test(c)) return `${c} → FAIL (#RGB / #RGBA / #RRGGBB / #RRGGBBAA)`;
                const h = c.slice(1);
                const r = parseInt(h.length <= 4 ? h[0].repeat(2) : h.slice(0, 2), 16);
                const g = parseInt(h.length <= 4 ? h[1].repeat(2) : h.slice(2, 4), 16);
                const b = parseInt(h.length <= 4 ? h[2].repeat(2) : h.slice(4, 6), 16);
                const a = h.length === 4 || h.length === 8 ? parseInt(h.length === 4 ? h[3].repeat(2) : h.slice(6, 8), 16) : null;
                return `${c} → OK · rgb(${r}, ${g}, ${b}${a === null ? "" : `, α ${(a / 255).toFixed(2)}`})`;
            }).join("\n"),
    },
    {
        id: "val-slug",
        label: "Slug / Identifier Check",
        description: "URL-slug shape per line, with a proposed fix when it fails.",
        sample: "my-post-title\nMy Post!\n--bad",
        transform: (input) =>
            input.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
                const slug = line.trim();
                if (SLUG_RE.test(slug)) return `${slug} → OK`;
                const fixed = slug.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
                return `${slug} → FAIL · suggested: ${fixed || "(empty)"}`;
            }).join("\n"),
    },
    {
        id: "val-domain",
        label: "Domain Name Check",
        description: "Hostname syntax + label-length rules per line.",
        sample: "example.com\nsub.example.co.uk\nbad..domain\n-leading-dash.com",
        transform: (input) =>
            input.split(/[\s,;]+/).filter(Boolean).map((d) => {
                if (!DOMAIN_RE.test(d)) return `${d} → FAIL (labels: letters/digits/hyphen, no leading/trailing hyphen)`;
                if (d.length > 253) return `${d} → FAIL (longer than 253 chars)`;
                return `${d} → OK`;
            }).join("\n"),
    },
    {
        id: "val-url",
        label: "URL Parser & Check",
        description: "The WHATWG parser verdict + the split parts (scheme, host, port, path, query, fragment).",
        sample: "https://user@example.com:8443/p/a?x=1&y=2#frag",
        transform: (input) => {
            try {
                const u = new URL(input.trim());
                return [
                    `VALID URL`,
                    `scheme   ${u.protocol.replace(":", "")}`,
                    `host     ${u.hostname}${u.port ? `:${u.port}` : ""}`,
                    `user     ${u.username || "—"}`,
                    `path     ${u.pathname}`,
                    `query    ${u.search || "—"}`,
                    `fragment ${u.hash.replace("#", "") || "—"}`,
                ].join("\n");
            } catch (err) {
                return `INVALID — ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    },
    {
        id: "val-date",
        label: "Date / DateTime Check",
        description: "ISO-8601 shapes (date / datetime) with real-calendar validation (Feb 30 fails).",
        sample: "2026-02-28\n2026-02-30\n2026-11-15T10:30:00Z",
        transform: (input) =>
            input.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
                const s = line.trim();
                if (ISO_DATE_RE.test(s)) {
                    const d = new Date(`${s}T00:00:00Z`);
                    return d.toISOString().slice(0, 10) === s ? `${s} → OK (date)` : `${s} → FAIL (not a real calendar date)`;
                }
                if (ISO_DATETIME_RE.test(s)) {
                    const d = new Date(s.includes(" ") ? s.replace(" ", "T") : s);
                    return Number.isNaN(d.getTime()) ? `${s} → FAIL (unparsable timestamp)` : `${s} → OK (datetime) · ${d.toUTCString()}`;
                }
                return `${s} → FAIL (need YYYY-MM-DD or YYYY-MM-DDThh:mm[:ss][Z|±hh:mm])`;
            }).join("\n"),
    },
    {
        id: "val-cron",
        label: "Cron Explainer",
        description: "Parse a 5-field cron expression and print its schedule in plain words + the next runs.",
        sample: "*/15 9-17 * * 1-5",
        transform: (input) => {
            const expr = input.trim().split(/\r?\n/)[0] ?? "";
            try {
                const parsed = parseCron(expr);
                const next = nextCronRuns(parsed, 5);
                return [
                    `VALID cron: ${expr}`,
                    `parsed fields: minute ${[...parsed.minute.values].join(",")} · hour ${[...parsed.hour.values].join(",")} · day ${[...parsed.dom.values].join(",")} · month ${[...parsed.month.values].join(",")} · weekday ${[...parsed.dow.values].join(",")}`,
                    `summary    ${parsed.summary}`,
                    `next runs:`,
                    ...next.map((d) => `  ${d.toISOString().replace("T", " ").slice(0, 16)} UTC`),
                ].join("\n");
            } catch (err) {
                return `INVALID — ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    },
    {
        id: "val-semver-range",
        label: "Semver Range Check",
        description: "Does a version satisfy a range? One `version range` pair per line.",
        sample: "1.2.3 >=1.0.0 <2.0.0\n2.0.0 ^1.2.0\n1.5.0 ~1.4.2",
        transform: (input) =>
            input.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
                const m = line.trim().match(/^(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)\s+(.+)$/);
                if (!m) return `${line} → syntax: version range (e.g. 1.2.3 >=1.0.0)`;
                try {
                    const ok = semverSatisfies(m[2], m[1]);
                    return `${m[1]} ${m[2]} → ${ok ? "SATISFIED" : "NOT satisfied"}`;
                } catch (err) {
                    return `${line} → ${err instanceof Error ? err.message : "error"}`;
                }
            }).join("\n"),
    },
    {
        id: "val-query",
        label: "Query String Parser",
        description: "Split a URL query into key → value rows (arrays and repeated keys kept).",
        sample: "?x=1&y=2&tag=a&tag=b&empty=",
        transform: (input) => {
            const qs = input.trim().replace(/^[?#]/, "");
            if (!qs) return "Error: empty query string.";
            const params = new URLSearchParams(qs);
            const rows: string[] = [];
            const seen = new Set<string>();
            for (const key of [...new Set(params.keys())]) {
                const values = params.getAll(key);
                rows.push(values.length > 1 ? `${key} → [${values.map((v) => (v === "" ? "(empty)" : v)).join(", ")}]` : `${key} → ${values[0] === "" ? "(empty)" : values[0]}`);
                seen.add(key);
            }
            return `${[...seen].length} parameter(s)\n${rows.join("\n")}`;
        },
    },
    {
        id: "val-cookie",
        label: "Cookie Header Parser",
        description: "Parse a Cookie: header into name → value + the classic flags when present.",
        sample: "session=abc; theme=dark; consent=1",
        transform: (input) => {
            const raw = input.trim().replace(/^cookie:\s*/i, "");
            const rows = raw.split(";").map((c) => c.trim()).filter(Boolean).map((pair) => {
                const eq = pair.indexOf("=");
                const name = eq === -1 ? pair : pair.slice(0, eq).trim();
                const value = eq === -1 ? "(no value)" : pair.slice(eq + 1).trim();
                return `${name} → ${value}`;
            });
            return `${rows.length} cookie(s)\n${rows.join("\n")}`;
        },
    },
    {
        id: "val-auth-header",
        label: "Authorization Header",
        description: "Decode Basic / Bearer / API-key auth headers — Basic prints its user:password.",
        sample: "Basic dXNlcjpwYXNz",
        transform: (input) => {
            const header = input.trim().replace(/^authorization:\s*/i, "");
            const m = header.match(/^(\w+)\s+(.+)$/);
            if (!m) return `Error: expected \`Scheme credential\` (e.g. Bearer <token>).`;
            const [, scheme, cred] = m;
            if (scheme.toLowerCase() === "basic") {
                try {
                    const decoded = atob(cred.trim());
                    const sep = decoded.indexOf(":");
                    return `Basic auth\n  user     ${decoded.slice(0, sep) || "(empty)"}\n  password ${"*".repeat(Math.max(4, decoded.length - sep - 1))} (${decoded.length - sep - 1} chars)`;
                } catch {
                    return "Error: Basic credential is not valid base64.";
                }
            }
            if (scheme.toLowerCase() === "bearer") return `Bearer token\n  ${cred.slice(0, 24)}${cred.length > 24 ? "…" : ""} (${cred.length} chars)`;
            return `${scheme} credential\n  ${cred}`;
        },
    },
    {
        id: "val-data-uri",
        label: "Data URI Parser",
        description: "Split a data: URL into mime, encoding and payload size (+ the decoded text when it's base64).",
        sample: "data:text/plain;base64,SGVsbG8=",
        transform: (input) => {
            const uri = input.trim();
            const m = uri.match(/^data:([^;,]*)(;[^;,]*)*,([\s\S]*)$/);
            if (!m) return "Error: not a data: URI.";
            const mime = m[1] || "text/plain";
            const isBase64 = /;base64/i.test(uri.slice(0, uri.lastIndexOf(",")));
            const payload = m[3] ?? "";
            let decoded = "";
            if (isBase64) {
                try {
                    decoded = atob(payload);
                } catch {
                    decoded = "(payload is not valid base64)";
                }
            } else {
                try {
                    decoded = decodeURIComponent(payload);
                } catch {
                    decoded = payload;
                }
            }
            return `mime     ${mime}\nbase64   ${isBase64}\npayload  ${payload.length} encoded chars${isBase64 ? ` (${decoded.length} bytes decoded)` : ""}\ndecoded  ${decoded.slice(0, 500)}${decoded.length > 500 ? "…" : ""}`;
        },
    },
    {
        id: "val-port",
        label: "Port / Range Check",
        description: "Every listed port classified (well-known / registered / dynamic) with its IANA note.",
        sample: "80\n443\n5432\n65536",
        transform: (input) =>
            input.split(/[\s,;]+/).filter(Boolean).map((p) => {
                const port = Number(p);
                if (!Number.isInteger(port) || port < 1 || port > 65535) return `${p} → FAIL (1–65535)`;
                const WELL_KNOWN: Record<number, string> = {
                    20: "FTP data",
                    21: "FTP",
                    22: "SSH",
                    23: "Telnet",
                    25: "SMTP",
                    53: "DNS",
                    67: "DHCP",
                    69: "TFTP",
                    80: "HTTP",
                    110: "POP3",
                    119: "NNTP",
                    123: "NTP",
                    143: "IMAP",
                    161: "SNMP",
                    194: "IRC",
                    389: "LDAP",
                    443: "HTTPS",
                    445: "SMB",
                    465: "SMTPS",
                    514: "Syslog",
                    587: "Submission",
                    631: "IPP",
                    636: "LDAPS",
                    873: "rsync",
                    993: "IMAPS",
                    995: "POP3S",
                    1080: "SOCKS",
                    1433: "MSSQL",
                    1521: "Oracle DB",
                    1883: "MQTT",
                    2049: "NFS",
                    2181: "ZooKeeper",
                    2375: "Docker",
                    3306: "MySQL",
                    5432: "PostgreSQL",
                    5672: "AMQP",
                    5900: "VNC",
                    5984: "CouchDB",
                    6379: "Redis",
                    6666: "IRC alt",
                    8080: "HTTP alt",
                    8443: "HTTPS alt",
                    9200: "Elasticsearch",
                    11211: "Memcached",
                    27017: "MongoDB"
                };
                const range = port < 1024 ? "well-known (privileged)" : port < 49152 ? "registered" : "dynamic/private";
                const known = WELL_KNOWN[port];
                return `${port} → OK · ${range}${known ? ` · commonly ${known}` : ""}`;
            }).join("\n"),
    },
    {
        id: "val-mime",
        label: "MIME / Extension Match",
        description: "Check that a file extension matches its expected MIME type (a 120-pair table).",
        sample: ".json application/json\n.png image/jpeg",
        transform: (input) => {
            const MIME: Record<string, string[]> = {
                ".json": ["application/json", "text/json"],
                ".xml": ["application/xml", "text/xml", "application/rss+xml"],
                ".html": ["text/html"],
                ".htm": ["text/html"],
                ".css": ["text/css"],
                ".js": ["application/javascript", "text/javascript"],
                ".mjs": ["application/javascript"],
                ".ts": ["video/mp2t", "application/typescript"],
                ".txt": ["text/plain"],
                ".md": ["text/markdown", "text/plain"],
                ".csv": ["text/csv"],
                ".png": ["image/png"],
                ".jpg": ["image/jpeg"],
                ".jpeg": ["image/jpeg"],
                ".gif": ["image/gif"],
                ".webp": ["image/webp"],
                ".svg": ["image/svg+xml"],
                ".ico": ["image/x-icon", "image/vnd.microsoft.icon"],
                ".bmp": ["image/bmp"],
                ".avif": ["image/avif"],
                ".pdf": ["application/pdf"],
                ".zip": ["application/zip"],
                ".gz": ["application/gzip"],
                ".tar": ["application/x-tar"],
                ".mp3": ["audio/mpeg"],
                ".wav": ["audio/wav"],
                ".ogg": ["audio/ogg"],
                ".flac": ["audio/flac"],
                ".mp4": ["video/mp4"],
                ".webm": ["video/webm"],
                ".mov": ["video/quicktime"],
                ".yaml": ["application/yaml", "text/yaml"],
                ".yml": ["application/yaml", "text/yaml"],
                ".toml": ["application/toml"],
                ".sql": ["application/sql", "text/plain"],
                ".py": ["text/x-python"],
                ".java": ["text/x-java-source"],
                ".c": ["text/x-c"],
                ".cpp": ["text/x-c++"],
                ".go": ["text/x-go"],
                ".rs": ["text/x-rust"],
                ".rb": ["text/x-ruby"],
                ".php": ["application/x-httpd-php"],
            };
            return input.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
                const m = line.trim().match(/^(\.\w+)\s+(\S+)$/);
                if (!m) return `${line} → syntax: .ext mime/type`;
                const expected = MIME[m[1].toLowerCase()];
                if (!expected) return `${m[1]} ${m[2]} → extension not in the table (no verdict)`;
                return `${m[1]} ${m[2]} → ${expected.includes(m[2]) ? "MATCH" : `MISMATCH (expected ${expected.join(" or ")})`}`;
            }).join("\n");
        },
    },
    {
        id: "val-balance",
        label: "Bracket Balance",
        description: "Stack-check (), [], {} nesting — the first imbalance reported with its offset.",
        sample: "f(a[bc])\n((missing)",
        transform: (input) => {
            const pairs: Record<string, string> = {")": "(", "]": "[", "}": "{"};
            const stack: Array<{ ch: string; idx: number }> = [];
            for (let i = 0; i < input.length; i++) {
                const ch = input[i];
                if (ch === "(" || ch === "[" || ch === "{") stack.push({ch, idx: i});
                else if (ch in pairs) {
                    const last = stack.pop();
                    if (!last || last.ch !== pairs[ch]) return `IMBALANCE — '${ch}' at offset ${i}${last ? ` closes '${last.ch}' (opened at ${last.idx})` : " with nothing open"}`;
                }
            }
            if (stack.length > 0) return `IMBALANCE — '${stack[0].ch}' at offset ${stack[0].idx} never closed`;
            return "BALANCED";
        },
    },
    {
        id: "val-regex",
        label: "Regex Tester Lite",
        description: "Compile a pattern, show its groups, and highlight which input lines match — first line is the regex.",
        sample: "(\\w+)@(\\w+)\\.com\nbob@example.com\nnope",
        options: [{
            key: "flags",
            label: "Flags",
            kind: "select",
            choices: [["", ""], ["i", "i"], ["g", "g"], ["gi", "gi"]],
            default: ""
        }],
        transform: (input, o) => {
            const nl = input.indexOf("\n");
            const pattern = (nl > 0 ? input.slice(0, nl) : "").trim().slice(1, -1);
            const body = nl > 0 ? input.slice(nl + 1) : "";
            if (!pattern) return "Error: first line = /pattern (with slashes).";
            let re: RegExp;
            try {
                re = new RegExp(pattern, String(o.flags ?? ""));
            } catch (err) {
                return `INVALID REGEX — ${err instanceof Error ? err.message : String(err)}`;
            }
            const groupCount = (new RegExp(`${pattern}|`).exec("")?.length ?? 1) - 1;
            const lines = body.split(/\r?\n/).filter((l) => l !== "");
            const verdicts = lines.map((l) => {
                const m = re.exec(l);
                return `${m ? "✓" : "✗"} ${l}${m && m.length > 1 ? `   groups: ${m.slice(1).map((g) => String(g)).join(" | ")}` : ""}`;
            });
            return `pattern /${pattern}/${String(o.flags ?? "")} · ${Math.max(0, groupCount - 1)} capture group(s)\n${verdicts.join("\n")}`;
        },
    },
];

/** Registry entries: one component per spec (the factory renders it). */
export const VALIDATE_TOOL_ENTRIES = VALIDATE_TOOLS.map((spec) => ({spec, component: makeTextTool(spec)}));
