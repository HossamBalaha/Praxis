import {NextRequest, NextResponse} from "next/server";

/**
 * API guard — bearer-token auth + rate limiting for every /api/* route.
 *
 * ── Auth (opt-in) ──────────────────────────────────────────────────
 * Praxis is a localhost-first single-user tool, but /api/run,
 * /api/term and friends are powerful. If you ever expose the port
 * (docker -p, Caddy, SSH tunnel, …), set:
 *
 * PRAXIS_ACCESS_TOKEN=<long-random-string>
 *
 * in the server environment. Every /api request must then carry
 *
 * Authorization: Bearer <token>
 *
 * The browser UI detects the 401 and asks for the token once (it is
 * kept in localStorage on the CLIENT only for the session; the server
 * never stores it). Unset / empty → auth is off (localhost default).
 *
 * ── Rate limiting (always on, per client IP) ───────────────────────
 * In-memory sliding-window counters. Classes:
 * exec — /api/run, /api/run-all, /api/console, /api/term*, … 60/min
 * ai — /api/ai-* 40/min
 * other — everything else (reads, file ops, git) 600/min
 * Override via PRAXIS_RATE_LIMIT_EXEC / _AI / _OTHER; set any to 0
 * to disable that class.
 *
 * Limitation (documented): the counters live in the proxy runtime's
 * memory. A single self-hosted instance is one process, so this is
 * accurate for the supported deployment; it is NOT a distributed
 * rate limiter.
 */

const EXEMPT_PATHS = new Set<string>([
    // The health probe lets uptime monitors / curl checks verify the
    // server without knowing the token.
    "/api/health",
]);

/** Request classes with their routes and default limits (per minute). */
const RATE_CLASSES: Array<{
    name: "exec" | "ai" | "other";
    test: (p: string) => boolean;
    env: string;
    default: number;
}> = [
    {
        name: "exec",
        test: (p) =>
            p.startsWith("/api/run") ||
            p.startsWith("/api/console") ||
            p.startsWith("/api/term") ||
            p.startsWith("/api/debug") ||
            p.startsWith("/api/profile") ||
            p.startsWith("/api/test") ||
            p.startsWith("/api/stop") ||
            p.startsWith("/api/watch"),
        env: "PRAXIS_RATE_LIMIT_EXEC",
        default: 60,
    },
    {
        name: "ai",
        test: (p) => p.startsWith("/api/ai-"),
        env: "PRAXIS_RATE_LIMIT_AI",
        default: 40,
    },
    {name: "other", test: () => true, env: "PRAXIS_RATE_LIMIT_OTHER", default: 600},
];

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();

function clientKey(request: NextRequest): string {
    const fwd = request.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    return request.headers.get("x-real-ip") ?? "local";
}

/** Constant-time-ish string compare (no short-circuit on mismatch). */
function tokensMatch(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function rateLimit(request: NextRequest, pathname: string): NextResponse | null {
    const cls = RATE_CLASSES.find((c) => c.test(pathname))!;
    const limit = Number(process.env[cls.env] ?? cls.default);
    if (!Number.isFinite(limit) || limit <= 0) return null; // disabled

    const now = Date.now();
    const windowStart = now - 60_000;
    const key = `${cls.name}:${clientKey(request)}`;
    let bucket = buckets.get(key);
    if (!bucket) {
        bucket = {hits: []};
        buckets.set(key, bucket);
    }
    bucket.hits = bucket.hits.filter((t) => t > windowStart);

    if (bucket.hits.length >= limit) {
        const retryAfterSec = Math.max(
            1,
            Math.ceil((bucket.hits[0] + 60_000 - now) / 1000)
        );
        return NextResponse.json(
            {
                error: `Rate limit exceeded (${cls.name}: ${limit}/min). Retry in ${retryAfterSec}s.`,
                rateLimited: true,
            },
            {status: 429, headers: {"Retry-After": String(retryAfterSec)}}
        );
    }
    bucket.hits.push(now);

    // Opportunistic cleanup so the Map cannot grow without bound when
    // many client IPs cycle through (e.g. behind a proxy).
    if (buckets.size > 10_000) {
        for (const [k, b] of buckets) {
            if (b.hits.every((t) => t <= windowStart)) buckets.delete(k);
        }
    }
    return null;
}

export function proxy(request: NextRequest) {
    const {pathname} = request.nextUrl;

    if (!pathname.startsWith("/api/")) return NextResponse.next();
    if (EXEMPT_PATHS.has(pathname)) return NextResponse.next();

    // ── Auth ──────────────────────────────────────────────────────────
    const required = process.env.PRAXIS_ACCESS_TOKEN?.trim();
    if (required) {
        const header = request.headers.get("authorization") ?? "";
        const presented = header.startsWith("Bearer ")
            ? header.slice(7).trim()
            : "";
        if (!presented || !tokensMatch(presented, required)) {
            return NextResponse.json(
                {
                    error:
                        "Praxis API requires an access token. Set the Authorization: Bearer header (the UI will prompt you once).",
                    tokenRequired: true,
                },
                {status: 401, headers: {"WWW-Authenticate": "Bearer"}}
            );
        }
    }

    // ── Rate limit ────────────────────────────────────────────────────
    const limited = rateLimit(request, pathname);
    if (limited) return limited;

    return NextResponse.next();
}

export const config = {
    matcher: ["/api/:path*"],
};
