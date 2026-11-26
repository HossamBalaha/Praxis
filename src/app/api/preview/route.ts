import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, sanitizeSubPath} from "@/lib/scripts";

/**
 * GET /api/preview?folder=<slug>&file=<path within folder>
 * GET /api/preview?folder=<slug>&entry=<relative html path>
 *
 * Serves ONE file from a folder folder for the live-preview iframe.
 * `file` is a RELATIVE path inside the folder (subpaths like
 * "web/styles.css" are allowed); `entry` is an alias used by the
 * preview panel when it only knows the entry HTML document.
 *
 * HTML documents (".html", ".htm", or an extensionless file literally
 * named "index") get a small <script> injected right after <head> that:
 *  (a) opens an EventSource to /api/preview-stream?folder=…,
 *  (b) reloads the document on "reload" events,
 *  (c) pipes console.log/warn/error + window.onerror +
 *      unhandledrejection to the HOST page via
 *      window.parent.postMessage({source:"praxis-preview", …}, "*").
 * The script does nothing else — page links are intentionally NOT
 * intercepted (documented limitation: relative <a href> navigation
 * does not resolve inside the sandboxed iframe).
 *
 * Relative asset URLs (quoted src/href on <script>/<img>/<video>/
 * <audio>/<source>/<track>/<link>) are rewritten to
 * /api/preview?folder=…&file=… so an arbitrary entry file works with
 * its sibling assets. String-level regex pass — known gaps (on
 * purpose, keep it cheap): unquoted attributes, url(…) inside inline
 * <style>, srcset and <a href> navigation stay untouched.
 *
 * Every other extension is served raw with the correct MIME type.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Extension → MIME type map for raw serving (small on purpose — the
 *  preview only needs web-asset kinds; anything else falls through to
 *  octet-stream). */
const MIME_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".geojson": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".avif": "image/avif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".ogv": "video/ogg",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".csv": "text/csv; charset=utf-8",
};

/** True when the document should get the injected preview script:
 *  a real .html/.htm file, or the extensionless "index" convention. */
function isHtmlDocument(relFile: string): boolean {
    const ext = path.posix.extname(relFile).toLowerCase();
    if (ext === ".html" || ext === ".htm") return true;
    return ext === "" && path.posix.basename(relFile).toLowerCase() === "index";
}

// ─── relative asset URL rewriting ─────────────────────────────────

/** True when the attribute value must stay untouched (absolute or
 *  inline forms). "?…" (same-document query hrefs) is included. */
function isExternalUrl(val: string): boolean {
    const lower = val.toLowerCase();
    return (
        lower.startsWith("http:") ||
        lower.startsWith("https:") ||
        lower.startsWith("//") ||
        lower.startsWith("data:") ||
        lower.startsWith("#") ||
        lower.startsWith("?")
    );
}

/** Textually normalize "a/./b/../c" style paths. Returns null when the
 *  path escapes above "" (the folder root) — the caller then leaves the
 *  original URL untouched instead of rewriting it into a broken one. */
function normalizeRelPath(rel: string): string | null {
    const out: string[] = [];
    for (const seg of rel.split("/")) {
        if (seg === "" || seg === ".") continue;
        if (seg === "..") {
            if (out.length === 0) return null;
            out.pop();
        } else {
            out.push(seg);
        }
    }
    return out.join("/");
}

/** Map one attribute value to a /api/preview URL, or null when the
 *  value must stay as-is. Leading "/" is treated as folder-ROOT
 *  relative (the static-site convention: "/style.css" → the project
 *  folder's style.css), everything else resolves against the current
 *  document's directory. */
function previewAssetUrl(
    val: string,
    folderSlug: string,
    fileDir: string
): string | null {
    const trimmed = val.trim();
    if (!trimmed || isExternalUrl(trimmed)) return null;
    const joined = trimmed.startsWith("/")
        ? trimmed.slice(1)
        : fileDir
            ? `${fileDir}/${trimmed}`
            : trimmed;
    const norm = normalizeRelPath(joined);
    if (norm === null || !norm) return null;
    return `/api/preview?folder=${encodeURIComponent(
        folderSlug
    )}&file=${encodeURIComponent(norm)}`;
}

/** Cheap string-level regex pass that prefixes RELATIVE quoted
 *  src/href attributes on asset tags with the /api/preview route. See
 *  the header comment for the intentional gaps. */
function rewriteRelativeAssetUrls(
    html: string,
    folderSlug: string,
    fileDir: string
): string {
    const rewrite = (
        match: string,
        lead: string,
        quote: string,
        val: string
    ): string => {
        const next = previewAssetUrl(val, folderSlug, fileDir);
        return next === null ? match : `${lead}${quote}${next}${quote}`;
    };
    return html
        .replace(
            /(<(?:script|img|video|audio|source|track)\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gi,
            rewrite
        )
        .replace(/(<link\b[^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gi, rewrite);
}

// ─── injected script ──────────────────────────────────────────────

/** Build the preview bootstrap <script>. The stream URL is embedded via
 *  JSON.stringify so a slug containing quotes/backslashes can never
 *  break out of the string literal. */
function buildInjectedScript(streamUrl: string): string {
    return `<script>
(function () {
  "use strict";
  try {
    var es = new EventSource(${JSON.stringify(streamUrl)});
    es.addEventListener("reload", function () {
      try { es.close(); } catch (e) {}
      location.reload();
    });
  } catch (e) { /* EventSource unavailable — live reload disabled */ }

  function send(payload) {
    try {
      window.parent.postMessage(
        Object.assign({ source: "praxis-preview" }, payload),
        "*"
      );
    } catch (e) { /* parent gone — drop the line */ }
  }
  function safeArg(a) {
    if (a === null || a === undefined) return String(a);
    var t = typeof a;
    if (t === "string" || t === "number" || t === "boolean") return a;
    try { return JSON.parse(JSON.stringify(a)); } catch (e) { return String(a); }
  }
  function pipe(method, kind) {
    var original = console[method] ? console[method].bind(console) : null;
    console[method] = function () {
      var args = [];
      for (var i = 0; i < arguments.length; i++) args.push(safeArg(arguments[i]));
      send({ kind: kind, args: args });
      if (original) { try { original.apply(console, arguments); } catch (e) {} }
    };
  }
  pipe("log", "log");
  pipe("warn", "warn");
  pipe("error", "error");
  window.onerror = function (message, source, lineno, colno) {
    send({
      kind: "error",
      message: String(message),
      source: source ? String(source) : "",
      lineno: typeof lineno === "number" ? lineno : 0,
      colno: typeof colno === "number" ? colno : 0
    });
    return false;
  };
  window.addEventListener("unhandledrejection", function (event) {
    send({ kind: "error", reason: safeArg(event && event.reason) });
  });
})();
</script>`;
}

/** Insert the script right after the <head> opening tag; when the
 *  document has no <head>, after a leading doctype, else at the very
 *  start. */
function injectPreviewScript(html: string, streamUrl: string): string {
    const script = buildInjectedScript(streamUrl);
    const headMatch = /<head[^>]*>/i.exec(html);
    if (headMatch) {
        const at = headMatch.index + headMatch[0].length;
        return html.slice(0, at) + script + html.slice(at);
    }
    const doctypeMatch = /^\s*<!doctype[^>]*>/i.exec(html);
    if (doctypeMatch) {
        return (
            html.slice(0, doctypeMatch[0].length) +
            script +
            html.slice(doctypeMatch[0].length)
        );
    }
    return script + html;
}

// ─── route handler ─────────────────────────────────────────────────

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const folderSlug = searchParams.get("folder") ?? "";
    // `entry` is an alias for `file` (the panel uses it when it only
    // knows the entry HTML document).
    const filePath = searchParams.get("file") ?? searchParams.get("entry") ?? "";
    if (!folderSlug || !filePath) {
        return NextResponse.json(
            {error: "Missing 'folder' or 'file' query parameter."},
            {status: 400}
        );
    }

    const folderName = deslugify(folderSlug);
    if (!folderName) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }

    // Shared sub-path sanitizer: rejects traversal (".."), backslashes,
    // absolute and hidden-segment forms while allowing "sub/dir/file".
    const fileRel = sanitizeSubPath(filePath);
    if (!fileRel) {
        return NextResponse.json({error: "Invalid file path."}, {status: 400});
    }

    // ── Path resolution + containment guards (copied from /api/file) ──
    const scriptsRoot = getScriptsRoot();
    const folderDir = path.join(scriptsRoot, folderName);
    const abs = path.join(folderDir, fileRel);
    const rel = path.relative(scriptsRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json(
            {error: "Path traversal blocked."},
            {status: 400}
        );
    }
    // The file param allows SUBPATHS, so also require the resolved path
    // to stay inside the folder dir itself — the scripts-root guard
    // alone would let "sub/../../sibling/x" hop to a sibling folder.
    const relInFolder = path.relative(folderDir, abs);
    if (relInFolder.startsWith("..") || path.isAbsolute(relInFolder)) {
        return NextResponse.json(
            {error: "Path traversal blocked."},
            {status: 400}
        );
    }

    try {
        const stat = await fs.stat(abs);
        if (!stat.isFile()) {
            return NextResponse.json({error: "Not a file."}, {status: 400});
        }
    } catch {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }

    const ext = path.extname(abs).toLowerCase();
    const baseName = path.basename(abs);

    // ── HTML documents: inject the preview bootstrap + rewrite assets ──
    if (isHtmlDocument(fileRel)) {
        let html: string;
        try {
            html = await fs.readFile(abs, "utf-8");
        } catch {
            return NextResponse.json(
                {error: "File could not be read."},
                {status: 500}
            );
        }
        // Directory of the served document (POSIX separators) — the base
        // for resolving its relative asset URLs. "" = folder root.
        const rawDir = path.posix.dirname(fileRel);
        const fileDir = rawDir === "." ? "" : rawDir;

        const streamUrl = `/api/preview-stream?folder=${encodeURIComponent(
            folderSlug
        )}`;
        const rewritten = rewriteRelativeAssetUrls(html, folderSlug, fileDir);
        const injected = injectPreviewScript(rewritten, streamUrl);

        return new NextResponse(injected, {
            status: 200,
            headers: {
                // no-store: a saved edit must never come back from the HTTP
                // cache as the pre-save copy.
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
            },
        });
    }

    // ── Everything else: raw bytes with the right MIME type ──
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    const data = await fs.readFile(abs);
    return new NextResponse(data, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Content-Length": String(data.length),
            "Content-Disposition": `inline; filename="${encodeURIComponent(baseName)}"`,
            // Revalidate every fetch so edited assets refresh on reload.
            "Cache-Control": "no-cache",
        },
    });
}
