import type {NextConfig} from "next";

/**
 * Security headers ( / audit hardening).
 *
 * Praxis renders untrusted local content by design (markdown files,
 * HTML sandboxes, CSVs), and exposes powerful APIs (/api/run, /api/term).
 * These headers reduce the blast radius if the port is ever reachable
 * from beyond localhost:
 *
 *   - CSP: everything same-origin. 'unsafe-eval' is required by Next's
 *     dev runtime (react-refresh); 'unsafe-inline' for scripts/styles is
 *     the pragmatic choice for a Next app without a nonce pipeline —
 *     Next injects inline hydration/bootstrap scripts.
 *   - blob:/data: are needed for figure URLs, drag-dropped file
 *     previews, and the sandboxed HTML preview iframes.
 *   - connect-src 'self' is enough: ALL AI provider calls are proxied
 *     through /api/ai-* routes (the SDK uses Node-only APIs, so it
 *     cannot run in the browser anyway).
 *   - X-Frame-Options + frame-ancestors: the app may frame ITSELF
 *     (FileViewer HTML preview), but nobody else may frame it.
 *
 * If you expose Praxis on a LAN with PRAXIS_ACCESS_TOKEN set (see
 * SECURITY.md), these headers are your second line of defense.
 */
const securityHeaders = [
    {
        key: "Content-Security-Policy",
        value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "media-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-src 'self' data: blob:",
            "worker-src 'self' blob:",
            "frame-ancestors 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
        ].join("; "),
    },
    {key: "X-Content-Type-Options", value: "nosniff"},
    {key: "X-Frame-Options", value: "SAMEORIGIN"},
    {key: "Referrer-Policy", value: "no-referrer"},
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    {key: "X-DNS-Prefetch-Control", value: "off"},
    // Only sent over HTTPS; harmless locally over http://localhost.
    {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
    },
];

const nextConfig: NextConfig = {
    output: "standalone",
    // node-unrar-js loads its unrar.wasm from its own dist folder at
    // runtime (fs + __dirname) — bundling it into the server chunks would
    // break that path. Keeping it external makes the standalone build
    // require it from node_modules, where the WASM actually lives.
    serverExternalPackages: ["node-unrar-js"],
    // Next 16's dev server only trusts
    // `localhost` by default — browsing via 127.0.0.1 (or a LAN IP) gets
    // its cross-origin check failed silently: the page shell renders but
    // HMR/hydration requests are dropped, so NOTHING hydrates (menus
    // dead, no API calls, "0 chapters" while /api/chapters returns data).
    // Declaring the origins explicitly keeps 127.0.0.1 usable in dev.
    allowedDevOrigins: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    // Type errors are checked by `bun run typecheck` (tsc --noEmit) —
    // part of `bun run check` (lint + typecheck + unit tests) — instead
    // of inside `next build`. Reason: the build's TypeScript step spawns
    // tsc WHILE the turbopack compile memory is still held, and on a
    // 4 GB machine that combination gets OOM-killed (the same constraint
    // the React Compiler opt-in notes below). Running tsc standalone
    // passes with the same result, just within the memory budget.
    typescript: {
        ignoreBuildErrors: true,
    },
    // Note: Next.js 16 removed the `eslint` config property. ESLint
    // during builds is now controlled via the project's eslint config
    // (eslint.config.mjs) + the `next lint` command, not next.config.
    reactStrictMode: true,
    // React Compiler (stable, Next 16): the main page is a single
    // ~12,900-line component with 140+ useState / 83 useEffect — every
    // file-open, dirty-flip and run-stream tick re-rendered the whole
    // tree through 150 hand-written callbacks. The compiler auto-memoizes
    // components and hook results at build time.
    //
    // MEMORY NOTE: the Babel pass over the two 500KB+ components
    // (page.tsx, code-viewer.tsx) needs a LOT of RAM — a 4 GB machine
    // gets OOM-killed mid-compile. It is therefore OPT-IN through
    // PRAXIS_REACT_COMPILER=1 (bun run build:compiler); machines with
    // 8 GB+ build fine with it and get the full auto-memoization.
    ...(process.env.PRAXIS_REACT_COMPILER === "1" ? {reactCompiler: true} : {}),
    async headers() {
        return [
            {
                // Apply to every route (pages + API). API responses benefit
                // from nosniff + CSP frame-ancestors too.
                source: "/:path*",
                headers: securityHeaders,
            },
        ];
    },
};

export default nextConfig;
