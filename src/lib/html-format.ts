/**
 * the HTML formatter behind the viewer's consolidated
 * toolbar "Format" button. A conservative beautifier with the
 * js-beautify default-HTML profile:
 *   ▸ an element whose children are ONLY text / inline tags renders
 *     on ONE line — `<p>hi</p>`, `<li>one</li>`, `<body></body>`;
 *   ▸ an element with BLOCK children (or void/self-closing tags)
 *     splits: the open tag on its own line, contents one level
 *     deeper, the close tag on its own line;
 *   ▸ raw regions (pre / textarea / script / style) render open +
 *     content + close VERBATIM on one line — their content is never
 *     re-indented or re-wrapped (a `>` or even a literal `</div>`
 *     inside a script string survives untouched);
 *   ▸ `>` inside a quoted attribute never ends a tag; a stray `<`
 *     that starts no tag stays literal text.
 *
 * Mirrors md-format.ts: pure functions, fully unit-tested
 * (__tests__/html-format.test.ts), zero dependencies.
 */

/** Block-level elements — force the split form and indent contents. */
const BLOCK = new Set([
    "html", "head", "body", "div", "nav", "header", "footer", "main",
    "section", "article", "aside", "ul", "ol", "li", "dl", "dt", "dd",
    "table", "thead", "tbody", "tr", "td", "th", "form", "fieldset",
    "select", "option", "optgroup", "video", "audio", "figure",
    "figcaption", "blockquote", "details", "summary", "picture", "map",
    "script", "style", "title", "svg", "g", "defs",
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "pre", "textarea",
]);

/** Void tags — `<img>`, `<br>` … never contain anything. */
const VOID = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
]);

/** Tags whose CONTENT is preformatted — never re-indent inside. */
const RAW = new Set(["pre", "textarea", "script", "style"]);

/** One scanning unit: a tag, a text chunk, or a comment. */
type Unit =
    | { t: "text"; v: string }
    | { t: "comment"; v: string }
    | { t: "tag"; name: string; closing: boolean; selfClose: boolean; v: string };

/** Split the source into text / comment / tag units with a scan that
 * is robust against quoted attribute values (a `>` inside a string
 * never ends the tag) and against a stray `<` that starts no tag. */
function scan(src: string): Unit[] {
    const out: Unit[] = [];
    let i = 0;
    while (i < src.length) {
        const lt = src.indexOf("<", i);
        if (lt < 0) {
            out.push({t: "text", v: src.slice(i)});
            break;
        }
        if (lt > i) out.push({t: "text", v: src.slice(i, lt)});
        // A `<` not starting a tag/comment (`< b`, `5 < 6`) is literal.
        const c1 = lt + 1 < src.length ? src[lt + 1] : "";
        if (!/[a-zA-Z!/]/.test(c1)) {
            out.push({t: "text", v: "<"});
            i = lt + 1;
            continue;
        }
        if (src.startsWith("<!--", lt)) {
            const end = src.indexOf("-->", lt + 4);
            const stop = end < 0 ? src.length : end + 3;
            out.push({t: "comment", v: src.slice(lt, stop)});
            i = stop;
            continue;
        }
        // Find the tag's end, skipping quoted attribute values.
        let j = lt + 1;
        let quote: string | null = null;
        while (j < src.length) {
            const c = src[j];
            if (quote) {
                if (c === quote) quote = null;
            } else if (c === '"' || c === "'") {
                quote = c;
            } else if (c === ">") {
                break;
            }
            j++;
        }
        const raw = src.slice(lt, Math.min(j + 1, src.length));
        const m = /^<\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)/.exec(raw);
        if (!m) {
            // `<!DOCTYPE …>` and friends — keep verbatim as text.
            out.push({t: "text", v: raw});
            i = lt + raw.length;
            continue;
        }
        out.push({
            t: "tag",
            name: m[1].toLowerCase(),
            closing: raw.startsWith("</"),
            selfClose: /\/>$/.test(raw.trim()),
            v: raw,
        });
        i = j + 1;
    }
    return out;
}

const isText = (u: Unit) => u.t === "text";
const isOpenBlock = (u: Unit) =>
    u.t === "tag" && !u.closing && !u.selfClose && !VOID.has(u.name) && BLOCK.has(u.name);

/**
 * Index of the close tag matching the open tag at `start`, counting
 * same-name nesting. Raw regions (script/pre/…) are skipped with a
 * naive first-match so a literal `</div>` inside a script string
 * never miscounts an outer div. -1 = no matching close.
 */
function findClose(units: Unit[], start: number): number {
    const name = (units[start] as { name: string }).name;
    let nest = 0;
    let k = start + 1;
    while (k < units.length) {
        const u = units[k];
        if (u.t === "tag" && !u.closing && !u.selfClose && !VOID.has(u.name) && RAW.has(u.name)) {
            // Skip the raw region (first matching close).
            let q = k + 1;
            while (q < units.length) {
                const r = units[q];
                if (r.t === "tag" && r.closing && r.name === u.name) break;
                q++;
            }
            k = q + 1;
            continue;
        }
        if (u.t === "tag" && u.name === name) {
            if (u.closing) {
                if (nest === 0) return k;
                nest--;
            } else if (!u.selfClose && !VOID.has(u.name)) {
                nest++;
            }
        }
        k++;
    }
    return -1;
}

type Piece = { kind: "open" | "close" | "text"; v: string };

/** Join inline parts with js-beautify spacing: space between
 * text↔text, close→text and text→open; none across open→text,
 * text→close or tag→tag adjacency. */
function joinParts(parts: Piece[]): string {
    let s = "";
    parts.forEach((p, i) => {
        if (i === 0) {
            s = p.v;
            return;
        }
        const prev = parts[i - 1];
        const space =
            (prev.kind === "text" && p.kind === "text") ||
            (prev.kind === "close" && p.kind === "text") ||
            (prev.kind === "text" && p.kind === "open");
        s += (space ? " " : "") + p.v;
    });
    return s;
}

/** Normalize single-quoted ATTRIBUTE values to double quotes inside a
 *  tag's source text: attr='v' → attr="v" when the value contains no
 *  double quote. Unquoted / already-double values are left alone; the
 *  function only ever runs on TAG source (never on text or raw
 *  script/pre/style content). */
export function normalizeHtmlAttrQuotes(tagSrc: string): string {
    return tagSrc.replace(
        /(\s[a-zA-Z_:][-a-zA-Z0-9_:.]*\s*=\s*)'([^']*)'(?=[\s/>]|$)/g,
        (m, pre: string, val: string) => (val.includes('"') ? m : `${pre}"${val}"`)
    );
}

/** Camel-case SVG / XML attributes that must NEVER be lowercased —
 *  viewbox / preserveaspectratio break SVG rendering outright. */
const KEEP_CASE_ATTRS = new Set([
    "viewBox", "preserveAspectRatio", "gradientTransform", "patternTransform",
    "clipPathUnits", "attributeName", "attributeType", "baseFrequency",
    "calcMode", "diffuseConstant", "edgeMode", "kernelMatrix", "kernelUnitLength",
    "keyPoints", "keySplines", "keyTimes", "lengthAdjust", "limitingConeAngle",
    "markerHeight", "markerWidth", "numOctaves", "overlinePosition",
    "paintOrder", "pointsAtX", "pointsAtY", "pointsAtZ", "specularConstant",
    "specularExponent", "spreadMethod", "startOffset", "stitchTiles",
    "surfaceScale", "targetX", "targetY", "text-anchor", "underlinePosition",
    "xChannelSelector", "yChannelSelector", "zoomAndPan",
]);

/** Lowercase the tag + attribute NAMES inside a tag's source text:
 *  `<DIV CLASS="x">` → `<div class="x">`. Attribute VALUES (quoted)
 *  are never touched — only names outside quotes — and the camel-case
 *  SVG attributes above keep their case verbatim. Runs on TAG units
 *  only (raw script/pre/style content is never rewritten). */
export function lowercaseHtmlTagNames(tagSrc: string): string {
    return tagSrc.replace(
        /<\/?[A-Za-z][^>]*>/g,
        (tag) =>
            // Lowercase the tag name right after < or </, then every
            // attribute NAME token before an `=` or whitespace/>.
            tag.replace(/^<\/?\s*[A-Za-z][A-Za-z0-9:-]*/, (m) => m.toLowerCase())
                .replace(/(\s[A-Za-z_:][-a-zA-Z0-9_:.]*)(?=\s*=)/g, (m, name: string) =>
                    KEEP_CASE_ATTRS.has(name.trim()) ? m : m.toLowerCase())
    );
}

/** Render the units with one line per block boundary.
 *  `attrQuotes: "double"` normalizes attribute quoting on every TAG
 *  unit; `lowercaseTags` lowercases the tag / attribute NAMES (values
 *  and raw element contents are never touched). */
export function formatHtml(
    src: string,
    indent = 2,
    attrQuotes: "keep" | "double" = "keep",
    lowercaseTags = true
): string {
    if (!src.trim()) return src;
    const units = scan(src).map((u) => {
        if (u.t !== "tag") return u;
        let v = u.v;
        if (attrQuotes === "double") v = normalizeHtmlAttrQuotes(v);
        if (lowercaseTags) v = lowercaseHtmlTagNames(v);
        return {...u, v};
    });
    const lines: string[] = [];
    let depth = 0;
    /** Inline run accumulator (text + inline tags at the current level). */
    let pieces: Piece[] = [];

    const pad = () => " ".repeat(Math.max(0, depth) * indent);
    const flush = () => {
        if (pieces.length) {
            const joined = joinParts(pieces);
            if (joined.trim()) lines.push(pad() + joined.trim());
            pieces = [];
        }
    };

    for (let k = 0; k < units.length; k++) {
        const u = units[k];
        if (isText(u)) {
            if (u.v.trim()) pieces.push({kind: "text", v: u.v.trim()});
            continue;
        }
        if (u.t === "comment") {
            flush();
            lines.push(pad() + u.v);
            continue;
        }
        // ── Tag units ─────────────────────────────────────────────────
        const tag = u;

        // RAW element: open + verbatim content + close on ONE line.
        if (!tag.closing && !tag.selfClose && !VOID.has(tag.name) && RAW.has(tag.name)) {
            flush();
            const open = pad() + tag.v;
            let acc = "";
            let closed = false;
            for (let q = k + 1; q < units.length; q++) {
                const r = units[q];
                if (r.t === "tag" && r.closing && r.name === tag.name) {
                    lines.push(open + acc + r.v);
                    closed = true;
                    k = q;
                    break;
                }
                acc += r.v;
            }
            if (!closed) lines.push(open + acc); // unterminated — keep content
            continue;
        }

        // Closing block tag.
        if (tag.closing && BLOCK.has(tag.name)) {
            flush();
            depth = Math.max(0, depth - 1);
            lines.push(pad() + tag.v);
            continue;
        }

        // Void / self-closing: own line.
        if (tag.selfClose || VOID.has(tag.name)) {
            flush();
            lines.push(pad() + tag.v);
            continue;
        }

        // Opening BLOCK tag — split or one-line by the children's shape.
        if (isOpenBlock(tag)) {
            flush();
            const closeIdx = findClose(units, k);
            let inlineSafe = closeIdx >= 0;
            for (let q = k + 1; inlineSafe && q < closeIdx; q++) {
                const r = units[q];
                if (r.t === "tag" && !r.closing && !r.selfClose && !VOID.has(r.name) && !BLOCK.has(r.name)) continue; // inline open
                if (r.t === "tag" && r.closing && !BLOCK.has(r.name)) continue; // inline close
                if (isText(r)) continue;
                inlineSafe = false; // block child / void / comment → split
            }
            if (inlineSafe) {
                // `<tag> inline content </tag>` on one line.
                const parts: Piece[] = [];
                for (let q = k + 1; q < closeIdx; q++) {
                    const r = units[q];
                    if (r.t === "text") {
                        if (r.v.trim()) parts.push({kind: "text", v: r.v.trim()});
                    } else if (r.t === "tag") {
                        parts.push({kind: r.closing ? "close" : "open", v: r.v});
                    }
                }
                lines.push(pad() + tag.v + joinParts(parts) + units[closeIdx].v);
                k = closeIdx;
                continue;
            }
            // Split form.
            lines.push(pad() + tag.v);
            depth++;
            continue;
        }

        // Inline open / close — merge into the current run.
        pieces.push({kind: tag.closing ? "close" : "open", v: tag.v});
    }
    flush();

    const out = lines.filter((l) => l !== "").join("\n");
    return out.endsWith("\n") ? out : out + "\n";
}

/* ────────────────────────────────────────────────────────────────── */
/* reindentHtml — the "Auto-indent" twin of */
/*  formatHtml. It ONLY normalizes the leading whitespace of each     */
/*  line from the tag structure: line content, blank lines and the    */
/*  raw regions (<pre>/<script>/<style>/<textarea>) stay exactly as   */
/*  authored. Use formatHtml for the full beautify (it also merges    */
/*  inline content and splits blocks onto their own lines).           */
/* ────────────────────────────────────────────────────────────────── */

/** Structural (block) tags open an indentation level. */
const REINDENT_STRUCTURAL =
    /^(?:html|head|body|div|section|article|aside|header|footer|main|nav|table|thead|tbody|tfoot|tr|ul|ol|dl|form|fieldset|select|details|summary|figure|figcaption|blockquote|picture|video|audio|svg|g|defs|symbol|template)\b/i;

/** Tags whose CONTENT is raw (never touched inside). */
const REINDENT_RAW = /^(?:script|style|pre|textarea)\b/i;

/** Void / never-nesting tags: emitted at the current depth. */
const REINDENT_VOID =
    /^<(?:meta|link|br|hr|img|input|area|base|col|embed|source|track|wbr|!|\/?>)/i;

/** Re-indent only — no line is moved, joined or split. */
export function reindentHtml(src: string, indentUnit = "  "): string {
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    let depth = 0;
    let rawTag: string | null = null;
    const out: string[] = [];
    const isClose = (l: string) => /^<\//.test(l);
    const closesRaw = (l: string, tag: string) =>
        new RegExp(`</${tag}\\s*>`, "i").test(l);

    for (const rawLine of lines) {
        const line = rawLine.trim();

        // Blank lines stay blank.
        if (!line) {
            out.push("");
            continue;
        }

        // Inside a raw region: untouched, until its closing tag shows up.
        if (rawTag) {
            out.push(rawLine);
            if (closesRaw(line, rawTag)) rawTag = null;
            continue;
        }

        // Comments / doctype / fragments: current depth, no level change.
        if (line.startsWith("<!") || line.startsWith("<!--")) {
            out.push(indentUnit.repeat(depth) + line);
            continue;
        }

        const closeMatch = line.match(/^<\/([a-zA-Z][\w:-]*)/);
        // A line that closes a structural block: outdent FIRST.
        if (closeMatch && REINDENT_STRUCTURAL.test(closeMatch[1])) {
            depth = Math.max(0, depth - 1);
        }
        out.push(indentUnit.repeat(depth) + line);

        // A line that opens a raw region: enter it (contents preserved).
        const rawMatch = line.match(/^<(script|style|pre|textarea)\b/i);
        if (rawMatch) {
            rawTag = rawMatch[1].toLowerCase();
            if (closesRaw(line, rawTag)) rawTag = null; // single-line raw tag
            continue;
        }

        // A line that opens a structural block (and does not close it on
        // the same line): indent the following lines.
        if (closeMatch || REINDENT_VOID.test(line)) continue;
        const openMatch = line.match(/^<([a-zA-Z][\w:-]*)/);
        if (openMatch && REINDENT_STRUCTURAL.test(openMatch[1]) && !/\/>\s*$/.test(line) && !closesRaw(line, openMatch[1].toLowerCase())) {
            depth++;
        }
    }
    return out.join("\n");
}

/* ────────────────────────────────────────────────────────────────── */
/* 
/*  languages"): wrapLongTagAttrs — the HTML / XML attribute-list      */
/*  wrapping pass. Runs AFTER formatHtml on its output, only when the  */
/*  Settings toggle is on: a line that is EXACTLY one open / void tag  */
/*  longer than the column budget gets its attributes broken onto      */
/*  indented continuation lines (prettier-style):                      */
/*                                                                      */
/*    <div class="hero" id="main" data-role="banner">                   */
/*  →                                                                   */
/*    <div                                                              */
/*      class="hero"                                                    */
/*      id="main"                                                       */
/*      data-role="banner">                                             */
/*                                                                      */
/*  Attribute splitting is QUOTE-AWARE (single / double quotes and      */
/*  their escaped forms never split mid-value). Lines that are not      */
/*  exactly one full tag, short lines, and single-attribute tags are    */
/*  never touched; raw-region contents never reach this pass.           */

/* ────────────────────────────────────────────────────────────────── */

/** True when the line is exactly one complete open / void tag (no other
 *  content before or after) — the only wrap candidate. */
function isWholeTagLine(line: string): boolean {
    return /^<[A-Za-z][^<>]*\/?>$/.test(line);
}

/** Split a tag line into [tag name, attributes…, closer] with
 *  quote-aware scanning. Returns null when anything is off. */
function splitTagParts(line: string): { name: string; attrs: string[]; closer: string } | null {
    const m = /^<([A-Za-z][\w:-]*)/.exec(line);
    if (!m) return null;
    const name = m[1];
    const rest = line.slice(m[0].length);
    const closerMatch = /\/?>$/.exec(rest);
    if (!closerMatch) return null;
    const closer = closerMatch[0];
    const body = rest.slice(0, rest.length - closer.length).trim();
    if (!body) return null;
    // Quote-aware split on runs of whitespace outside '…' / "…".
    const attrs: string[] = [];
    let cur = "";
    let quote: string | null = null;
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (quote) {
            cur += ch;
            if (ch === "\\") {
                cur += body[i + 1] ?? "";
                i++;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            cur += ch;
            continue;
        }
        if (ch === " " || ch === "\t") {
            if (cur) attrs.push(cur);
            cur = "";
            continue;
        }
        cur += ch;
    }
    if (cur) attrs.push(cur);
    if (quote) return null; // unbalanced — not touching this line
    return {name, attrs, closer};
}

/** Wrap attribute lists of long whole-tag lines to the column budget. */
export function wrapLongTagAttrs(src: string, cols = 100): string {
    if (!src) return src;
    const budget = Math.max(40, Math.floor(cols));
    const out: string[] = [];
    for (const rawLine of src.split("\n")) {
        const trimmed = rawLine.trim();
        if (
            rawLine.length <= budget ||
            !trimmed ||
            !isWholeTagLine(trimmed)
        ) {
            out.push(rawLine);
            continue;
        }
        const parts = splitTagParts(trimmed);
        if (!parts || parts.attrs.length < 2) {
            out.push(rawLine);
            continue;
        }
        const indent = rawLine.slice(0, rawLine.length - rawLine.trimStart().length);
        const attrIndent = indent + "  ";
        out.push(`${indent}<${parts.name}`);
        for (let i = 0; i < parts.attrs.length; i++) {
            const last = i === parts.attrs.length - 1;
            out.push(`${attrIndent}${parts.attrs[i]}${last ? parts.closer : ""}`);
        }
    }
    return out.join("\n");
}
