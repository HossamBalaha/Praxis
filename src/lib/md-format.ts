/**
 * pure, offline Markdown auto-formatting + auto-indenting
 * (the explorer's right-click Organize ▸ menu for.md files — the
 * Python-only Format/Auto-indent finally has a Markdown twin).
 *
 * options + TABLE formatting:
 * ▸ `MdFormatOptions` threads the configured indent width through
 * (Settings → Editor → Formatting → Indent width)
 * ▸ `formatTables` (default on) aligns pipe-table cells so every
 * `|` lines up — the example table comes out padded and
 * prettier-clean.
 *
 * Both functions are STRING → STRING, no deps, and they never touch
 * fenced code blocks (those keep whatever indentation the author
 * wrote — re-indenting code inside fences would corrupt it).
 */

export interface MdFormatOptions {
    /** List indent unit (Settings → Editor → Formatting; default:
     *  auto-detect 2/4 as before). */
    indentWidth?: number;
    /** Format pipe tables inside the document (default true). */
    formatTables?: boolean;
    /** Ensure exactly one trailing newline (default true). */
    finalNewline?: boolean;
    /** Normalize the bullet marker on Auto-format (default "-"):
     *  "-" rewrites `* item` markers to `- item`, "*" the reverse.
     *  Only REAL list-item markers change — emphasis (`*text*`) and
     *  horizontal rules (`***`) are never touched. */
    bulletChar?: "-" | "*";
    /** Ensure one blank line before every ATX heading on Auto-format
     *  (default true) — consistent section breaks. */
    headingSpace?: boolean;
}

const FENCE_RE = /^\s{0,3}(```|~~~)/;
const ATX_HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*$/;
const LIST_ITEM_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

/** A pipe-table row split into cells (handles the optional leading /
 *  trailing pipes and `\|` escapes). */
function splitTableRow(line: string): string[] | null {
    let s = line.trim();
    if (!s.includes("|")) return null;
    const hasLead = s.startsWith("|");
    const hasTrail = s.endsWith("|") && !s.endsWith("\\|");
    if (hasLead) s = s.slice(1);
    if (hasTrail) s = s.slice(0, -1);
    // split on unescaped pipes; code spans may contain pipes so a bare
    // `|` inside backticks would split — acceptable for a light
    // formatter (the same trade-off Prettier makes).
    const cells: string[] = [];
    let cur = "";
    for (let i = 0; i < s.length; i++) {
        if (s[i] === "\\" && s[i + 1] === "|") {
            cur += "\\|";
            i++;
            continue;
        }
        if (s[i] === "|") {
            cells.push(cur);
            cur = "";
            continue;
        }
        cur += s[i];
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
}

/** Is this the delimiter row (`| --- |:---: | ---: |`)? */
function isDelimiterRow(cells: string[]): boolean {
    if (cells.length === 0) return false;
    return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

/** Alignment inferred from a delimiter cell. */
function delimAlign(c: string): "left" | "center" | "right" {
    const left = c.startsWith(":");
    const right = c.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
}

/** Visible width of a cell (`\|` renders as one char). */
function cellWidth(c: string): number {
    return c.replace(/\\\|/g, "|").length;
}

function padCell(c: string, width: number, align: "left" | "center" | "right"): string {
    const visible = cellWidth(c);
    const room = Math.max(0, width - visible);
    if (align === "center") {
        const l = Math.floor(room / 2);
        const r = room - l;
        return `${" ".repeat(l)}${c}${" ".repeat(r)}`;
    }
    if (align === "right") return `${" ".repeat(room)}${c}`;
    return `${c}${" ".repeat(room)}`;
}

/** Format every pipe table in the document (fences skipped):
 *   ▸ cells padded so every pipe lines up
 *   ▸ the delimiter row re-dashed to the padded widths
 *   ▸ alignment colons preserved (`:---` / `:---:` / `---:`)
 *   ▸ tables whose rows disagree on the cell count are left as-is. */
export function formatMarkdownTables(text: string): string {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const out: string[] = [];
    let inFence = false;
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const wasInFence = inFence;
        if (FENCE_RE.test(line)) inFence = !inFence;
        if (inFence || wasInFence !== inFence) {
            out.push(line);
            i++;
            continue;
        }

        const header = splitTableRow(line);
        if (header && header.length > 0 && i + 1 < lines.length) {
            const delim = splitTableRow(lines[i + 1]);
            if (delim && isDelimiterRow(delim) && delim.length === header.length) {
                // A table! Collect the body rows.
                let j = i + 2;
                const body: string[][] = [];
                while (j < lines.length) {
                    const row = splitTableRow(lines[j]);
                    if (!row || row.length !== header.length) break;
                    if (isDelimiterRow(row)) break;
                    body.push(row);
                    j++;
                }
                // Widths: max cell width per column (min 3 for the dashes).
                const nCols = header.length;
                const aligns = delim.map(delimAlign);
                const widths = new Array<number>(nCols).fill(3);
                for (let c = 0; c < nCols; c++) {
                    widths[c] = Math.max(widths[c], cellWidth(header[c]));
                    for (const row of body) widths[c] = Math.max(widths[c], cellWidth(row[c]));
                }
                const renderRow = (cells: string[]) =>
                    `| ${cells.map((c, idx) => padCell(c, widths[idx], aligns[idx])).join(" | ")} |`;
                // Delimiter row re-dashed to the padded widths; alignment
                // colons preserved (`:---` / `:---:` / `---:`), plain `---`
                // for the default left alignment.
                const renderDelim = () =>
                    `| ${delim.map((c, idx) => {
                        const w = widths[idx];
                        const a = delimAlign(c);
                        const extra = a === "center" ? 2 : a === "right" ? 1 : 0;
                        const dashes = "-".repeat(Math.max(3, w - extra));
                        if (a === "center") return `:${dashes}:`;
                        if (a === "right") return `${dashes}:`;
                        return dashes; // plain `---` (left is the default)
                    }).join(" | ")} |`;

                out.push(renderRow(header));
                out.push(renderDelim());
                for (const row of body) out.push(renderRow(row));
                i = j;
                continue;
            }
        }
        out.push(line);
        i++;
    }

    return out.join("\n");
}

/**
 * AUTO-FORMAT — the "prettier-light" pass:
 *   ▸ trailing whitespace stripped on every line
 *   ▸ exactly ONE blank line before every ATX heading (not at file start)
 *   ▸ heading close sequences removed ("# Head #" → "# Head")
 *   ▸ runs of 3+ blank lines collapsed to one
 *   ▸ pipe tables aligned (formatTables, default on)
 *   ▸ a single trailing newline at EOF
 *   ▸ fenced code blocks are frozen (skipped verbatim)
 */
export function formatMarkdown(text: string, options: MdFormatOptions = {}): string {
    const formatTables = options.formatTables ?? true;
    const finalNewline = options.finalNewline ?? true;
    const bulletChar = options.bulletChar ?? "-";
    const headingSpace = options.headingSpace ?? true;
    const withTables = formatTables ? formatMarkdownTables(text) : text;
    const lines = withTables.replace(/\r\n?/g, "\n").split("\n");
    const out: string[] = [];
    let inFence = false;
    let blanks = 0;

    for (const raw of lines) {
        const wasInFence = inFence;
        inFence = fenceToggle(raw, inFence);
        if (inFence !== wasInFence) {
            // Fence marker line (opening or closing) — untouched.
            blanks = 0;
            out.push(raw);
            continue;
        }
        if (inFence) {
            out.push(raw); // inside a code block — untouched
            continue;
        }
        let line = raw.replace(/\s+$/, "");
        // Bullet normalization: a REAL list item (marker + space + content
        // or a bare marker ending the line) gets the configured marker.
        // `*text*` emphasis never matches (no space after the star), and
        // horizontal rules (`***`, `- - -`) are guarded out below.
        if (bulletChar === "-" || bulletChar === "*") {
            const li = /^(\s*)[-*](?=\s|$)/.exec(line);
            const isHorizontalRule = /^([-*+][ \t]*){3,}$/.test(line.trim());
            if (li && !isHorizontalRule) {
                line = `${li[1]}${bulletChar}${line.slice(li[1].length + 1)}`;
            }
        }
        if (line.trim() === "") {
            blanks++;
            if (blanks <= 1) out.push("");
            continue;
        }
        const heading = ATX_HEADING_RE.exec(line);
        if (heading) {
            // Strip a closing sequence ("### Head ###" → "### Head").
            const body = heading[2].replace(/\s+#+\s*$/, "");
            const normalized = `${heading[1]} ${body}`;
            // Ensure exactly one blank line before a heading (unless the
            // document starts with it or the previous line is already the
            // intended blank we just emitted). The headingSpace option
            // (Settings → Formatting) gates the pass.
            const lastOut = out[out.length - 1];
            if (headingSpace && out.length > 0 && lastOut !== "" && blanks === 0) {
                out.push("");
            }
            blanks = 0;
            out.push(normalized);
            continue;
        }
        blanks = 0;
        out.push(line);
    }

    // Collapse the double blank a heading may leave at EOF, ensure
    // exactly one trailing newline.
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const joined = out.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/** True while inside a fenced code block (``` / ~~~). Returns the
 *  state AFTER processing the line — callers must ASSIGN the result
 *  (not treat it as an is-marker boolean). */
function fenceToggle(line: string, inFence: boolean): boolean {
    if (FENCE_RE.test(line)) return !inFence;
    return inFence;
}

/**
 * AUTO-INDENT — list structure only (the Markdown analogue of the
 * Python re-indenter):
 *   ▸ the indent UNIT is detected from the document itself (the most
 *     common leading-space step of already-indented list items; 2
 *     spaces when nothing is nested yet) — or taken from the
 * configured `indentWidth` option
 *   ▸ every list item's indentation becomes level × unit
 *   ▸ task-list markers, ordered items and nested quotes keep their
 *     content aligned
 *   ▸ fenced code blocks are frozen (skipped verbatim)
 *   ▸ lines that are soft continuations of a list item keep the
 *     item's content column
 */
export function reindentMarkdown(text: string, options: MdFormatOptions = {}): string {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");

    // ── 1. detect the indent unit ──────────────────────────────────
    // Configured width wins; else 4 only when EVERY nested indent is a
    // clean multiple of 4 (4-space documents stay 4-space); else 2.
    const indents: number[] = [];
    let inFence = false;
    for (const line of lines) {
        inFence = fenceToggle(line, inFence);
        if (inFence) continue;
        const m = LIST_ITEM_RE.exec(line);
        if (m) {
            const indent = m[1].replace(/\t/g, "  ").length;
            if (indent > 0) indents.push(indent);
        }
    }
    const unit = options.indentWidth && options.indentWidth > 0
        ? Math.min(8, options.indentWidth)
        : indents.length > 0 && indents.every((i) => i % 4 === 0)
            ? 4
            : 2;

    // ── 2. re-indent ────────────────────────────────────────────────
    const out: string[] = [];
    inFence = false;
    // Stack of the open list items: `orig` = the item's ORIGINAL
    // leading-space count (dedent detection), `col` = the NEW content
    // column (level × unit + marker width). Soft continuation lines
    // align to the innermost item's column.
    const stack: Array<{ orig: number; col: number }> = [];

    for (const line of lines) {
        const wasInFence = inFence;
        inFence = fenceToggle(line, inFence);
        if (inFence !== wasInFence) {
            stack.length = 0;
            out.push(line);
            continue;
        }
        if (inFence) {
            out.push(line);
            continue;
        }

        // Blank lines do NOT close a list — keep the stack, pass through.
        if (line.trim() === "") {
            out.push("");
            continue;
        }

        const trimmedStart = line.length - line.trimStart().length;
        const m = LIST_ITEM_RE.exec(line);

        if (m) {
            const orig = m[1].replace(/\t/g, "  ").length;
            // DEDENT + SIBLING: pop every item at the same or deeper
            // original indent — a sibling REPLACES its parent's slot.
            while (stack.length > 0 && orig <= stack[stack.length - 1].orig) {
                stack.pop();
            }
            const level = stack.length;
            const indent = " ".repeat(level * unit);
            const marker = m[2];
            const content = m[3];
            stack.push({orig, col: level * unit + marker.length + 1});
            out.push(`${indent}${marker} ${content.replace(/\s+$/, "")}`);
            continue;
        }

        // Indented non-list line inside an open item → soft continuation /
        // nested paragraph: align to the innermost item's content column.
        if (trimmedStart > 0 && stack.length > 0) {
            const column = stack[stack.length - 1].col;
            out.push(`${" ".repeat(column)}${line.trim().replace(/\s+$/, "")}`);
            continue;
        }

        // Plain paragraph / heading — closes every open list.
        stack.length = 0;
        out.push(line.replace(/\s+$/, ""));
    }

    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    return `${out.join("\n")}\n`;
}
