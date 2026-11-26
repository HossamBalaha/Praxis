/**
 * Click-time prefetch for file content.
 *
 * WHY: opening a file used to be strictly serial —
 *   click → (React render commit) → useEffect fires → fetch → response
 *         → setState → (second render) → content paints.
 * The fetch only STARTED after the render commit, so the network
 * round-trip was added on top of the render time. In dev mode the
 * commit alone takes several hundred milliseconds (development
 * react-dom build), which made every file open feel sluggish.
 *
 * WHAT: the click handlers now call `prefetchFileContent` BEFORE
 * the state updates, kicking the HTTP request off immediately. The
 * fetch effects (page.tsx /api/code, FileViewer /api/file,
 * SheetDataView /api/data-sheet) then look the in-flight promise up
 * via `takePrefetched` and await it instead of starting a duplicate
 * request. Result: the network transfer overlaps with the render,
 * so the perceived open time is max(render, RTT) instead of
 * render + RTT.
 *
 * Cache policy: prefetched promises live in a small Map and are
 * evicted a few seconds after they settle — content edited on disk
 * is always re-fetched on the next open, and a settled entry never
 * serves stale bytes to a later, unrelated request. Media/image
 * prefetches use the browser HTTP cache (the /api/file route sends
 * `Cache-Control: public, max-age=3600`) so the <img>/<video>/
 * <iframe> element reuses the warmed response instead of
 * double-downloading.
 */
import type {FileKind} from "@/lib/scripts";
import {interpreterQuery} from "@/lib/settings";

/** In-flight / freshly-settled prefetches keyed by exact URL. */
const inflight = new Map<string, Promise<Response>>();

/** How long a settled promise stays reusable (ms). */
const EVICT_DELAY_MS = 4_000;

function track(url: string, init?: RequestInit): Promise<Response> {
    const existing = inflight.get(url);
    if (existing) return existing;
    const p = fetch(url, init);
    inflight.set(url, p);
    const evict = () => {
        setTimeout(() => {
            if (inflight.get(url) === p) inflight.delete(url);
        }, EVICT_DELAY_MS);
    };
    p.then(evict, evict);
    return p;
}

/**
 * Best-effort background fetch. Never throws — prefetch failures are
 * swallowed; the consumer's own fetch (or error handling) applies.
 */
export function prefetchUrl(url: string, init?: RequestInit): void {
    try {
        void track(url, init);
    } catch {
        /* best-effort only */
    }
}

/**
 * Return a promise for a FRESH CLONE of the response started by a
 * matching `prefetchUrl` call (same URL string), or null. Does NOT
 * start a request.
 *
 * The clone-per-take matters: effects re-run (React StrictMode
 * double-mount, re-selecting the same file, …) and each run would
 * otherwise try to read the SAME Response body a second time —
 * `TypeError: body stream already read`. Cloning from the
 * never-directly-read original lets any number of consumers parse
 * their own copy.
 */
export function takePrefetched(url: string): Promise<Response> | null {
    const p = inflight.get(url);
    if (!p) return null;
    return p.then((res) => res.clone());
}

/**
 * Drop any settled / in-flight prefetch for a file so the NEXT open
 * re-fetches FRESH bytes. Called after every successful write — a
 * settled entry otherwise stayed reusable for EVICT_DELAY_MS and
 * served the PRE-SAVE content when the user saved and switched back
 * within that window (the edit looked like it “did not save”).
 */
export function invalidatePrefetchedFile(folderSlug: string, fileSlug: string): void {
    if (!folderSlug || !fileSlug) return;
    inflight.delete(fileUrlFor(folderSlug, fileSlug));
    inflight.delete(codeUrlFor(folderSlug, fileSlug));
}

/* ------------------------------------------------------------------ */
/*  URL builders — MUST byte-match the URLs the consuming effects      */
/*  build, or the dedupe silently misses.                             */

/* ------------------------------------------------------------------ */

/** /api/code — Python file content (page.tsx code effect). */
export function codeUrlFor(folderSlug: string, fileSlug: string): string {
    return `/api/code?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`;
}

/** /api/file — raw bytes / text for any file kind. */
export function fileUrlFor(folderSlug: string, fileSlug: string): string {
    return `/api/file?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`;
}

/**
 * /api/data-sheet — pandas-backed spreadsheet reader. `fileSlug` is
 * the addressing form the FileViewer uses (supports NESTED files);
 * `name` (plain root filename) is the DataFileBrowser form.
 */
export function dataSheetUrlFor(
    folderSlug: string,
    opts: { fileSlug?: string; name?: string; sheet?: string }
): string {
    let url = `/api/data-sheet?folder=${encodeURIComponent(folderSlug)}&`;
    url += opts.fileSlug
        ? `file=${encodeURIComponent(opts.fileSlug)}`
        : `name=${encodeURIComponent(opts.name ?? "")}`;
    if (opts.sheet) url += `&sheet=${encodeURIComponent(opts.sheet)}`;
    // selected-env passthrough (fixes "missing pandas" when
    // the auto-detected env differs from the selected one).
    url += interpreterQuery();
    return url;
}

/** Kinds whose content is fetched as TEXT by the FileViewer. */
const TEXT_KINDS: ReadonlySet<FileKind> = new Set<FileKind>([
    "markdown",
    "text",
    "json",
    "yaml",
    "toml",
    "sql",
    "r",
    "shell",
    "html",
    "css",
    "csv",
    "ipynb",
    "log",
    "javascript",
    "typescript",
    "matlab",
    "java",
    "c",
    "cpp",
    "ruby",
    "php",
    "go",
    "lua",
    "perl",
    "rust",
    "julia",
    "kotlin",
    "swift",
    "powershell",
    "batch",
    "zig",
    "dart",
    "groovy",
    "scala",
    "elixir",
    "haskell",
    "erlang",
    "clojure",
    "ocaml",
    "fsharp",
    "graphql",
]);

/** Kinds rendered by a media element that can hit the HTTP cache. */
const MEDIA_KINDS: ReadonlySet<FileKind> = new Set<FileKind>([
    "image",
    "video",
    "audio",
    "pdf",
]);

/**
 * Prefetch whatever the viewer for this file kind will need, so the
 * request is in flight while React renders the selection change.
 * `kind` is the viewer's FileKind string; unknown values prefetch
 * both the code and raw-file forms (a 404 JSON error response is a
 * cheap no-op, and one of the two is exactly what the viewer needs).
 */
export function prefetchFileContent(
    kind: string | undefined,
    folderSlug: string,
    fileSlug: string
): void {
    if (!folderSlug || !fileSlug) return;
    if (kind === "python") {
        prefetchUrl(codeUrlFor(folderSlug, fileSlug), {cache: "no-store"});
        return;
    }
    if (kind === "spreadsheet") {
        prefetchUrl(dataSheetUrlFor(folderSlug, {fileSlug}), {cache: "no-store"});
        return;
    }
    if (kind !== undefined && TEXT_KINDS.has(kind as FileKind)) {
        prefetchUrl(fileUrlFor(folderSlug, fileSlug), {cache: "no-store"});
        return;
    }
    if (kind !== undefined && MEDIA_KINDS.has(kind as FileKind)) {
        // Default cache mode — the <img>/<video>/<iframe> request that
        // follows is served from the browser HTTP cache.
        prefetchUrl(fileUrlFor(folderSlug, fileSlug));
        return;
    }
    // Unknown kind: prefetch BOTH the code and raw-file forms — a 404
    // JSON error response is a cheap no-op, and one of the two will be
    // exactly what the viewer needs.
    prefetchUrl(codeUrlFor(folderSlug, fileSlug), {cache: "no-store"});
    prefetchUrl(fileUrlFor(folderSlug, fileSlug), {cache: "no-store"});
}
