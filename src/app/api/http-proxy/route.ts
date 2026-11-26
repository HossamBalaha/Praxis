import {NextRequest, NextResponse} from "next/server";

/**
 * POST /api/http-proxy — a server-side fetch relay for the API client
 * workbench (bypasses browser CORS so local/remote APIs are testable
 * from the IDE itself).
 *
 * Body: { url, method, headers: Array<{key,value}> | Record<string,string>,
 *         body?: string, timeoutMs?: number (default 15000, max 60000) }
 *
 * Deliberately simple and honest host policy: this is a localhost-first
 * IDE, so ANY http/https host is allowed (loopback included) — the only
 * scheme-level block is non-http(s) URLs (file:, data:, ftp: …).
 *
 * Hard limits everywhere else:
 *  - response body capped at 2 MB (utf-8 lossy; the stream is CANCELLED
 *    at the cap so a 5 GB file never lands in memory)
 *  - at most 3 redirects followed (a 4th is returned as-is)
 *  - credentials never sent (credentials: "omit")
 *  - timeout aborts the request (AbortController → 504)
 *  - hop-by-hop / framing headers are dropped, never forwarded
 *
 * Response: { ok: true, status, statusText, headers, bodyText, timeMs,
 * sizeBytes, truncated, redirects, finalUrl } | { ok: false, error }.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
/** Small floor so a 0/negative value can't produce an instantly-aborted
 *  request that never touches the network. */
const MIN_TIMEOUT_MS = 500;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB response cap
const MAX_REDIRECTS = 3;

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** Hop-by-hop / transport-framed headers — never forwarded; the runtime
 *  recomputes them (content-length from the actual body, etc.). */
const HOP_BY_HOP = new Set([
    "host",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "content-length",
]);

interface HeaderRow {
    key: string;
    value: string;
}

interface ProxyBody {
    url?: string;
    method?: string;
    headers?: HeaderRow[] | Record<string, string>;
    body?: string;
    timeoutMs?: number;
}

/** Header list → clean outgoing header record: strips CR/LF (defensive —
 *  a raw newline in a header value is request-smuggling territory),
 *  drops empty keys and every hop-by-hop name, case-insensitively. */
function normalizeHeaders(headers: ProxyBody["headers"]): Record<string, string> {
    const out: Record<string, string> = {};
    const clean = (s: string) => s.replace(/[\r\n]/g, "");
    if (Array.isArray(headers)) {
        for (const row of headers) {
            if (!row || typeof row.key !== "string" || !row.key.trim()) continue;
            out[clean(row.key).toLowerCase()] = clean(String(row.value ?? ""));
        }
    } else if (headers && typeof headers === "object") {
        for (const [k, v] of Object.entries(headers as Record<string, string>)) {
            if (!k.trim()) continue;
            out[clean(k).toLowerCase()] = clean(String(v ?? ""));
        }
    }
    for (const name of HOP_BY_HOP) delete out[name];
    return out;
}

/** Stream-read the response body up to the 2 MB cap, then CANCEL the
 *  stream — the transfer stops instead of buffering gigabytes just to
 *  truncate them afterwards. The returned text is the first (at most)
 *  exactly-2 MB of BYTES decoded utf-8-lossy (invalid sequences become
 *  replacement characters). */
function concatBytes(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.byteLength;
    }
    return out;
}

async function readCapped(
    res: Response
): Promise<{ text: string; sizeBytes: number; truncated: boolean }> {
    const reader = res.body?.getReader();
    if (!reader) return {text: "", sizeBytes: 0, truncated: false};
    const chunks: Uint8Array[] = [];
    let received = 0;
    let truncated = false;
    try {
        for (; ;) {
            const {done, value} = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) {
                chunks.push(value);
                received += value.byteLength;
                if (received >= MAX_BODY_BYTES) {
                    truncated = true;
                    try {
                        await reader.cancel();
                    } catch {
                        /* already closed */
                    }
                    break;
                }
            }
        }
    } finally {
        try {
            reader.releaseLock();
        } catch {
            /* cancelled readers refuse the release — fine */
        }
    }
    // hard BYTE cut so the payload never exceeds exactly the 2 MB cap
    const all = concatBytes(chunks);
    const payload = received > MAX_BODY_BYTES ? all.subarray(0, MAX_BODY_BYTES) : all;
    const text = new TextDecoder("utf-8").decode(payload); // fatal:false — lossy
    return {text, sizeBytes: payload.byteLength, truncated};
}

export async function POST(request: NextRequest) {
    let body: ProxyBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ok: false, error: "Invalid JSON body."}, {status: 400});
    }

    const rawUrl = (body.url ?? "").trim();
    if (!rawUrl) {
        return NextResponse.json({ok: false, error: "Missing 'url'."}, {status: 400});
    }
    let target: URL;
    try {
        target = new URL(rawUrl);
    } catch {
        return NextResponse.json({ok: false, error: `Invalid URL: ${rawUrl}`}, {status: 400});
    }
    // the ONLY host-level rule: non-http(s) schemes are refused outright
    if (target.protocol !== "http:" && target.protocol !== "https:") {
        return NextResponse.json(
            {ok: false, error: `Scheme ${target.protocol} is not allowed — use http or https.`},
            {status: 400}
        );
    }

    const method = (body.method ?? "GET").toUpperCase();
    if (!HTTP_METHODS.has(method)) {
        return NextResponse.json(
            {ok: false, error: `Method ${method} is not supported.`},
            {status: 400}
        );
    }

    // GET/HEAD carry no body in fetch — a body set on those methods is
    // dropped (fetch would throw), not an error.
    const sendsBody = method !== "GET" && method !== "HEAD";
    let requestBody = sendsBody ? body.body ?? "" : undefined;
    const outHeaders = normalizeHeaders(body.headers);

    const requestedTimeout =
        typeof body.timeoutMs === "number" && Number.isFinite(body.timeoutMs)
            ? body.timeoutMs
            : DEFAULT_TIMEOUT_MS;
    const timeoutMs = Math.min(
        MAX_TIMEOUT_MS,
        Math.max(MIN_TIMEOUT_MS, Math.round(requestedTimeout))
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    let currentUrl = target;
    let redirects = 0;
    let requestMethod = method;
    let res: Response;

    try {
        for (; ;) {
            res = await fetch(currentUrl, {
                method: requestMethod,
                headers: outHeaders,
                body: requestBody,
                redirect: "manual", // redirects are followed BY HAND, capped at 3
                credentials: "omit", // never send credentials
                signal: controller.signal,
            });
            const location = res.headers.get("location");
            const status = res.status;
            if (status >= 300 && status < 400 && location) {
                if (redirects >= MAX_REDIRECTS) break; // a 4th redirect is returned as-is
                let next: URL;
                try {
                    next = new URL(location, currentUrl);
                } catch {
                    break; // unparseable Location — surface the 3xx itself
                }
                if (next.protocol !== "http:" && next.protocol !== "https:") {
                    break; // never follow a redirect into a non-http scheme
                }
                redirects += 1;
                currentUrl = next;
                // browser-like method rewrite: 303 always, and 301/302 after a
                // body-carrying method, restart as GET without the body
                if (
                    status === 303 ||
                    ((status === 301 || status === 302) && requestMethod !== "GET" && requestMethod !== "HEAD")
                ) {
                    requestMethod = "GET";
                    requestBody = undefined;
                    delete outHeaders["content-type"];
                }
                continue;
            }
            break;
        }
        clearTimeout(timer);
    } catch (err) {
        clearTimeout(timer);
        const aborted = controller.signal.aborted;
        const message = aborted
            ? `Request timed out after ${timeoutMs} ms`
            : (err as Error).message || "Network request failed";
        return NextResponse.json({ok: false, error: message}, {status: aborted ? 504 : 502});
    }

    const {text, sizeBytes, truncated} = await readCapped(res);
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
    });

    return NextResponse.json({
        ok: true,
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        bodyText: text,
        truncated,
        sizeBytes,
        timeMs: Date.now() - startedAt,
        redirects,
        finalUrl: currentUrl.href,
    });
}
