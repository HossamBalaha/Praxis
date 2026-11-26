import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {resolveFigurePath, resolveScriptPath,} from "@/lib/scripts";
import {readSourceText} from "@/lib/export-guard";

/**
 * POST /api/export/html
 *
 * Body: {
 *   folder: <slug>,
 *   file: <slug>,
 *   stdout?: string,
 *   stderr?: string,
 *   figures?: string[],   // figure file names (resolved via runId)
 *   runId?: string,       // required to resolve figure paths
 * }
 *
 * Bundles the script's source code, last-run stdout/stderr, and any
 * captured figures into a single self-contained HTML document with
 * inline CSS (dark theme, monospace font) and base64-embedded images.
 * The result is fully portable: open it offline in any browser, mail
 * it, attach it to a bug report — no external requests needed.
 *
 * Response: { ok: true, html: string, filename: string }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** HTML-escape a string for safe embedding in `<pre>` content. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Apply a very small Python syntax highlighter on top of an
 * already-HTML-escaped source. We wrap comments, strings, and a
 * handful of keywords in `<span>` tags so the export looks reasonable
 * without pulling in a full highlighter library (keeps the bundle
 * tiny and the output self-contained).
 *
 * The order of replacements matters: we tokenize using a single regex
 * with alternation so a character is only consumed by one rule.
 */
function highlightPython(escaped: string): string {
    // We work on the escaped text. The replacements below operate on the
    // escaped characters (so "&quot;" represents a double quote, etc.).
    // To keep things simple and safe, we run a sequence of regex passes
    // over the escaped text — each pass only matches regions not already
    // inside a span.

    // 1. Triple-quoted strings ("""...""" or '''...'''). Escaped quotes
    //    look like &quot; and &#39;.
    let out = escaped.replace(
        /(&quot;&quot;&quot;[\s\S]*?&quot;&quot;&quot;|&#39;&#39;&#39;[\s\S]*?&#39;&#39;&#39;)/g,
        '<span class="tok-str">$1</span>'
    );

    // 2. Single-line comments (# ... end-of-line). Use a lookahead to
    //    stop at the newline without consuming it.
    out = out.replace(
        /(^|\n)([ \t]*#[^\n]*)/g,
        (_m, lead, comment) => `${lead}<span class="tok-com">${comment}</span>`
    );

    // 3. Single/double quoted strings (single line, non-greedy).
    out = out.replace(
        /(&quot;(?:\\.|[^&\n])*?&quot;|&#39;(?:\\.|[^&\n])*?&#39;)/g,
        '<span class="tok-str">$1</span>'
    );

    // 4. Keywords (word-boundary, not inside a span we already added).
    const keywords = [
        "def", "class", "return", "import", "from", "as", "if", "elif", "else",
        "for", "while", "break", "continue", "try", "except", "finally", "with",
        "raise", "yield", "lambda", "global", "nonlocal", "pass", "assert", "del",
        "in", "is", "not", "and", "or", "None", "True", "False", "async", "await",
    ];
    const kwRe = new RegExp(`\\b(${keywords.join("|")})\\b`, "g");
    // To avoid double-processing inside existing spans, we split on the
    // span boundaries and only highlight outside them.
    const parts = out.split(/(<span class="tok-[a-z]+">[\s\S]*?<\/span>)/g);
    out = parts
        .map((part) => {
            if (part.startsWith('<span class="tok-')) return part;
            return part.replace(kwRe, '<span class="tok-kw">$1</span>');
        })
        .join("");

    // 5. Numbers (integers and floats).
    out = out.replace(
        /\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g,
        (m, _g, offset: number, full: string) => {
            // Skip if inside an existing span (cheap heuristic: check the
            // preceding 30 chars for an unclosed `<span class="tok-`).
            const before = full.slice(Math.max(0, offset - 30), offset);
            if (/<span class="tok-[a-z]+"[^>]*>[^<]*$/.test(before)) return m;
            return `<span class="tok-num">${m}</span>`;
        }
    );

    return out;
}

/** MIME type for a figure based on its extension. */
function mimeForFigure(name: string): string {
    const ext = path.extname(name).toLowerCase();
    switch (ext) {
        case ".png":
            return "image/png";
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".gif":
            return "image/gif";
        case ".webp":
            return "image/webp";
        case ".svg":
            return "image/svg+xml";
        default:
            return "image/png";
    }
}

const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  background: #0d1117;
  color: #c9d1d9;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  margin: 0;
  padding: 24px;
  line-height: 1.5;
  font-size: 14px;
}
header {
  border-bottom: 1px solid #30363d;
  padding-bottom: 16px;
  margin-bottom: 24px;
}
header h1 {
  margin: 0 0 8px 0;
  font-size: 20px;
  color: #f0f6fc;
}
header .meta {
  color: #8b949e;
  font-size: 12px;
}
section {
  margin-bottom: 32px;
}
h2 {
  color: #58a6ff;
  font-size: 16px;
  margin: 0 0 12px 0;
  padding-bottom: 6px;
  border-bottom: 1px solid #21262d;
}
pre {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  margin: 0;
  white-space: pre;
  tab-size: 4;
}
pre.code { counter-reset: line; }
pre.stderr { color: #f85149; }
.tok-com { color: #8b949e; font-style: italic; }
.tok-str { color: #a5d6ff; }
.tok-kw  { color: #ff7b72; }
.tok-num { color: #79c0ff; }
.figures {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.figures figure {
  margin: 0;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 12px;
}
.figures img {
  max-width: 100%;
  height: auto;
  display: block;
}
.figures figcaption {
  color: #8b949e;
  font-size: 12px;
  margin-top: 8px;
}
.empty { color: #8b949e; font-style: italic; }
`;

export async function POST(request: Request) {
    let body: {
        folder?: string;
        file?: string;
        stdout?: string;
        stderr?: string;
        figures?: string[];
        runId?: string;
        source?: string; // live editor buffer (client-supplied)
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            {error: "Invalid JSON body."},
            {status: 400}
        );
    }

    const {folder, file, stdout, stderr, figures, runId, source: inlineSource} = body;
    if (!folder || !file) {
        return NextResponse.json(
            {error: "Body must include 'folder' and 'file' slugs."},
            {status: 400}
        );
    }

    // anyKind — the standalone HTML export works for every
    // file kind.
    const resolved = await resolveScriptPath(folder, file, {anyKind: true});
    if (!resolved) {
        return NextResponse.json(
            {error: "File not found inside python_scripts/."},
            {status: 404}
        );
    }

    let source: string;
    // Live buffer first (≤ 2 MB, mirrors the .md route): unsaved edits
    // belong in the exported report. Binary disk sources are refused
    // (utf-8 pipes produce mojibake in the standalone report).
    if (typeof inlineSource === "string" && inlineSource.length > 0 && inlineSource.length <= 2 * 1024 * 1024) {
        source = inlineSource;
    } else {
        const text = await readSourceText(resolved.absPath, resolved.fileName);
        if (text === null) {
            return NextResponse.json(
                {error: `${resolved.fileName} is a binary file — the standalone HTML report needs a text source. Use Download instead.`},
                {status: 415}
            );
        }
        source = text;
    }

    // Resolve + base64-encode each requested figure.
    const figureBlocks: string[] = [];
    if (runId && figures && figures.length > 0) {
        for (const figName of figures) {
            try {
                const figPath = await resolveFigurePath(runId, figName);
                if (!figPath) throw new Error("figure not found");
                const data = await fs.readFile(figPath);
                const mime = mimeForFigure(figName);
                // SVG figures are inlined as a base64 data URI,
                // exactly like the raster path. Inlining the raw SVG text let a
                // script that labels an axis with <script>...</script> produce
                // an export that executes when opened — the SVG content is
                // attacker-controlled (it comes from matplotlib output built
                // from user data) and was never escaped. A data: URI renders
                // the image without executing its content.
                const b64 = data.toString("base64");
                figureBlocks.push(
                    `<figure>` +
                    `<figcaption>${escapeHtml(figName)}</figcaption>` +
                    `<img src="data:${mime};base64,${b64}" alt="${escapeHtml(figName)}" />` +
                    `</figure>`
                );
            } catch {
                // Figure not available — record a placeholder so the user
                // knows something was supposed to be there.
                figureBlocks.push(
                    `<figure><figcaption>${escapeHtml(figName)} (missing)</figcaption>` +
                    `<p class="empty">[figure unavailable]</p></figure>`
                );
            }
        }
    }

    const escapedSource = escapeHtml(source);
    // the Python token highlighter only runs for actual
    // .py sources — JSON / CSV / SQL / etc. used to get PYTHON keyword
    // spans painted over their numbers and keywords, which is wrong
    // highlighting, not just cosmetic noise.
    const isPythonSource = /\.pyw?$/i.test(resolved.fileName);
    const highlighted = isPythonSource ? highlightPython(escapedSource) : escapedSource;

    const stdoutHtml = stdout?.trim()
        ? `<pre>${escapeHtml(stdout.trimEnd())}</pre>`
        : `<p class="empty">(no stdout)</p>`;
    const stderrHtml = stderr?.trim()
        ? `<pre class="stderr">${escapeHtml(stderr.trimEnd())}</pre>`
        : `<p class="empty">(no stderr)</p>`;
    const figuresHtml = figureBlocks.length > 0
        ? `<div class="figures">${figureBlocks.join("\n")}</div>`
        : `<p class="empty">(no figures)</p>`;

    const exportedAt = new Date().toISOString();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(resolved.fileName)} — ${escapeHtml(resolved.folderName)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>${escapeHtml(resolved.fileName)}</h1>
  <div class="meta">
    Folder: <strong>${escapeHtml(resolved.folderName)}</strong> ·
    Exported: ${escapeHtml(exportedAt)}
  </div>
</header>

<section>
  <h2>Source</h2>
  <pre class="code">${highlighted}</pre>
</section>

<section>
  <h2>stdout</h2>
  ${stdoutHtml}
</section>

<section>
  <h2>stderr</h2>
  ${stderrHtml}
</section>

<section>
  <h2>Figures</h2>
  ${figuresHtml}
</section>
</body>
</html>`;

    return NextResponse.json({
        ok: true,
        html,
        filename: `${resolved.fileName.replace(/\.[^.]+$/, "")}.html`,
    });
}
