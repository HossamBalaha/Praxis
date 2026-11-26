/* Praxis service worker — app-shell cache for same-origin static GETs.
 *
 * A naive cache-first handler would answer EVERY same-origin GET with
 * no TTL — including all /api GETs — so after the first visit the
 * chapter list, git status, code and settings would be served from
 * Cache Storage forever and the watcher-driven auto-refresh would
 * silently stop reaching the server. A failed API GET could also
 * fall back to the cached HTML shell and return HTTP 200 where the
 * client expected JSON.
 *
 * API and SSE requests are therefore NEVER intercepted — with ONE
 * narrow, deliberate exception (D16, offline file access):
 *
 *   GET /api/code and GET /api/file go NETWORK-FIRST with a
 *   runtime-cache fallback ("praxis-files-v1"). While a connection
 *   exists the live server response is returned untouched (so the
 *   watcher-driven auto-refresh and "saved edits re-read fresh"
 *   behavior are exactly as before); only when the network is
 *   UNREACHABLE is the last good stored copy replayed. That gives
 *   "recently-opened files" offline without ever serving stale data
 *   while online.
 *
 *   Guard rails on those two routes (the original no-/api policy,
 *   restated as rules):
 *     - GET only — POST/PUT/DELETE are never inspected, never served
 *       from cache, never stored (/api/run, /api/term, /api/spell and
 *       every file-write POST always reach the server).
 *     - the whitelist matches full path segments, so /api/file-write,
 *       /api/file-stats, /api/file-move … never qualify.
 *     - only status-200 "basic" responses are stored — no 4xx/5xx
 *       bodies, no 206 range fragments, no opaque cross-origin
 *       replies.
 *     - Cache-Control: no-store responses are honored and never
 *       stored (/api/file sends it for TEXT content on purpose — see
 *       that route; media served with max-age=3600 and /api/code
 *       JSON have no no-store and are storable).
 *     - requests carrying a cache-buster query param (t=, bust=,
 *       fresh=, …) pass through unserved and unstored — persisting
 *       them would defeat the freshness the caller explicitly
 *       asked for.
 *     - the cache is capped (LRU by last insertion — a re-put moves
 *       the entry to the end; the oldest entry is evicted beyond 120).
 *
 * The cache keys carry no labels — just the app name — and activation
 * deletes any cache outside this version's expected set so stale
 * entries can never survive a strategy change.
 */
const CACHE = "praxis-shell";
const APP_SHELL = ["/", "/manifest.json", "/logo.svg"];

/* ── D16: runtime cache for recently-opened file content ─────────── */
const FILES_CACHE = "praxis-files-v1";
const FILES_CACHE_MAX_ENTRIES = 120;
/* Exact path prefixes served by the runtime strategy. Matched on full
 * segments ("/api/file" matches "/api/file" and "/api/file/…", never
 * "/api/file-write"). */
const FILE_API_PREFIXES = ["/api/code", "/api/file"];
/* Query params that mark a URL as a one-shot cache-buster. None of the
 * app's current file URLs use them (folder= / file= only) — this is
 * future-proofing so a `?fresh=1`-style request can never be answered
 * from or written into the offline cache. */
const CACHE_BUSTER_PARAMS = new Set([
  "t", "ts", "time", "timestamp", "bust", "cachebust", "cache-bust",
  "nocache", "no-cache", "nostore", "no-store", "fresh", "nonce",
  "rand", "random",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        // Keep exactly this version's caches (shell + file runtime
        // cache); anything else — older "praxis-files-vN" names
        // included — is stale and gets deleted.
        keys.filter((k) => k !== CACHE && k !== FILES_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const {request} = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isStream = (request.headers.get("accept") || "").includes("text/event-stream");

  // ── D16: file-content GETs — network-first, offline cache fallback.
  // (Streams are never synthesized; range requests — media seeking —
  // must stay between the browser and the server so a cached full
  // body can never answer a 206 partial.)
  if (!isStream && isFileApiPath(url.pathname)) {
    if (request.headers.has("range") || hasCacheBusterParam(url)) return;
    event.respondWith(fileContentResponse(request));
    return;
  }

  // Never intercept any other API endpoint or event stream — they must
  // always reach the server so the UI reflects the real state of the
  // files. (All SSE endpoints in this app live under /api/*; the Accept
  // check is belt-and-braces for any future stream route.)
  if (
    isStream ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Document navigations: network-first, offline falls back to the
  // cached app shell (a legitimate offline fallback for a PWA).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Static assets (/_next/static etc. — content-hashed, immutable):
  // cache-first, network fallback. A failed static fetch returns a
  // clean 503 instead of the HTML shell (the old fallback handed HTML
  // to a <script>/<img> consumer with a bogus 200).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => new Response("Offline", {status: 503, statusText: "Offline"}));
    })
  );
});

/* Standard update escape hatch. Today install() already skipWaiting()s
 * (new versions activate immediately); keeping the message accepted
 * means a future version can switch to prompt-based updates without
 * the page needing to know. */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/* ── D16 helpers ──────────────────────────────────────────────────── */

/** True only for the two whitelisted file-content endpoints (full
 *  path segments — "/api/file-write" & co. never match). */
function isFileApiPath(pathname) {
  return FILE_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

/** True when the URL carries an explicit cache-buster query param. */
function hasCacheBusterParam(url) {
  for (const key of url.searchParams.keys()) {
    if (CACHE_BUSTER_PARAMS.has(key.toLowerCase())) return true;
  }
  return false;
}

/** True when the SERVER explicitly opted this response out of any
 *  storage (e.g. /api/file's no-store for text content). */
function forbidsCaching(response) {
  return (response.headers.get("cache-control") || "")
    .toLowerCase()
    .includes("no-store");
}

/** Network-first with offline fallback for /api/code + /api/file. */
async function fileContentResponse(request) {
  try {
    const response = await fetch(request);
    if (
      response &&
      response.status === 200 &&
      response.type === "basic" &&
      !forbidsCaching(response)
    ) {
      // Warm the offline copy in the background — a caching failure
      // (quota, private mode, …) must never fail the live response.
      storeFileResponse(request, response.clone()).catch(() => {
      });
    }
    // Errors (404/500/…) are returned as-is: the client sees the real
    // server verdict, and the last good cached copy is NOT used to
    // mask it.
    return response;
  } catch {
    // Network unreachable (offline / connection refused): replay the
    // last good copy when we have one…
    const cached = await caches
      .open(FILES_CACHE)
      .then((cache) => cache.match(request));
    if (cached) return cached;
    // …otherwise a clean JSON 503 — never the HTML shell, which the
    // caller would parse as a bogus-200 API response.
    return new Response(
      JSON.stringify({error: "Offline — this file is not in the offline cache."}),
      {
        status: 503,
        statusText: "Offline",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }
}

/** Store a fresh copy, evicting least-recently-stored entries past the
 *  cap. `cache.keys()` preserves insertion order, so delete-then-put
 *  (re-put moves the key to the end) + trimming from the front is an
 *  LRU by last successful fetch. */
async function storeFileResponse(request, response) {
  const cache = await caches.open(FILES_CACHE);
  await cache.delete(request);
  await cache.put(request, response);
  const keys = await cache.keys();
  const excess = keys.length - FILES_CACHE_MAX_ENTRIES;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}
