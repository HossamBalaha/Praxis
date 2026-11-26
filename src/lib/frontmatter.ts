/**
 * YAML front-matter splitting for Markdown files.
 *
 * The classic view used to feed the RAW file into ReactMarkdown, so a
 * leading
 * ---
 * title: "Sensor Report"
 * ---
 * block rendered as thematic breaks + a setext H2 that visually
 * OVERLAPPED the body content (the "classic view of the md has
 * overlapping content" report — react-markdown has no front-matter
 * support and the project deliberately has no gray-matter dep).
 *
 * This tiny parser splits the block off and exposes the key: value
 * pairs as an ordered list the viewer renders as a metadata card.
 * Single-line scalars only — nested YAML structures keep their raw
 * text shown verbatim under their key.
 */

export interface FrontMatterEntry {
    key: string;
    value: string;
}

export interface FrontMatterSplit {
    /** Ordered key → value entries (null when the file has no block). */
    entries: FrontMatterEntry[] | null;
    /** The raw block including the two `---` fences (null when absent). */
    raw: string | null;
    /** Everything AFTER the closing fence (or the original text). */
    body: string;
}

/** Does a `key: value` line (already trimmed) look like a simple
 *  single-line YAML scalar? Complex/nested values return false and
 *  are kept verbatim. */
function simpleScalar(value: string): boolean {
    return !/^[&*!|>%@`]/.test(value) && !value.includes("\n");
}

export function splitFrontMatter(text: string): FrontMatterSplit {
    if (typeof text !== "string") {
        return {entries: null, raw: null, body: text};
    }
    // A BOM or leading blank lines in front of the opening `---` fence
    // made the OLD startsWith("---") check fail, so the raw block was
    // fed to ReactMarkdown again — thematic breaks + a setext H2
    // OVERLAPPING the body. The fence is now detected after a BOM strip
    // + leading blank lines, and the body
    // keeps those blanks trimmed so the card starts flush.
    const stripped = text.replace(/^\uFEFF/, "").replace(/^[ \t]*\r?\n+/, "");
    if (!stripped.startsWith("---")) {
        return {entries: null, raw: null, body: text};
    }
    // Allow a `\r\n` file too.
    const nl = stripped.slice(3, 5) === "\r\n" ? "\r\n" : stripped.slice(3, 4) === "\n" ? "\n" : null;
    if (!nl) return {entries: null, raw: null, body: text};

    const lines = stripped.split(nl);
    // lines[0] === "---"
    let close = -1;
    for (let i = 1; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === "---" || trimmed === "..." || trimmed === "----") {
            close = i;
            break;
        }
        // A blank line before any key: line means this is NOT front matter
        // (a leading `---` HR followed by normal content).
        if (trimmed === "" && i > 1) break;
    }
    if (close < 1) return {entries: null, raw: null, body: text};

    const raw = lines.slice(0, close + 1).join(nl);
    const body = lines.slice(close + 1).join(nl).replace(/^\r?\n/, "");
    const entries: FrontMatterEntry[] = [];
    for (let i = 1; i < close; i++) {
        const line = lines[i];
        const m = /^([^:#\s][^:]*):\s*(.*)$/.exec(line);
        if (!m) continue; // comments / blank / nested lines — skipped
        const key = m[1].trim();
        const value = m[2].trim();
        if (!key) continue;
        entries.push({key, value: simpleScalar(value) ? value : value || line.trim()});
    }
    return {entries: entries.length > 0 ? entries : null, raw, body};
}
