/**
 * pure, offline TOML auto-formatting + auto-indenting
 * (the "toml files are not presented/indented correctly" fix: TOML
 * finally joins Python / Markdown / HTML in the Organize ▸ right-click
 * twins AND the viewer's view/edit-mode Format menu).
 *
 * Both functions are STRING → STRING, no deps, and they are
 * conservative: comments, quoted keys/values, dotted keys and the
 * bytes of multiline strings keep their content — only whitespace /
 * structure is normalized.
 *
 * formatToml ▸ tidy spacing around `=`, aligned key column (opt),
 * one blank line before each [table] / [[array]]
 * header, normalized multiline-array indentation, a
 * single trailing newline
 * reindentToml ▸ multiline-array indentation only (the TOML analogue
 * of the Markdown list re-indenter)
 */

export interface TomlFormatOptions {
    /** Indent width for nested array items (Settings → Editor →
     *  Formatting → Indent width; default 2). */
    indentWidth?: number;
    /** Pad the key column inside each run of `key = value` lines so the
     * `=` column lines up (default true — the "presented correctly"
     * requested part). */
    alignEquals?: boolean;
    /** Ensure exactly one trailing newline (default true). */
    finalNewline?: boolean;
}

/** Split a trailing `# comment` off a line, ignoring `#` inside
 *  quoted strings (basic single/double and triple-quoted forms). */
function splitComment(text: string): { body: string; comment: string | null } {
    let inS = false;
    let inD = false;
    let tripleS = false;
    let tripleD = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (tripleS) {
            if (text.startsWith("'''", i)) {
                tripleS = false;
                i += 2;
            }
            continue;
        }
        if (tripleD) {
            if (text.startsWith('"""', i)) {
                tripleD = false;
                i += 2;
            }
            continue;
        }
        if (inS) {
            if (ch === "'") inS = false;
            continue;
        }
        if (inD) {
            if (ch === '"') inD = false;
            continue;
        }
        if (text.startsWith("'''", i)) {
            tripleS = true;
            i += 2;
            continue;
        }
        if (text.startsWith('"""', i)) {
            tripleD = true;
            i += 2;
            continue;
        }
        if (ch === "'") {
            inS = true;
            continue;
        }
        if (ch === '"') {
            inD = true;
            continue;
        }
        if (ch === "#") {
            return {body: text.slice(0, i).replace(/\s+$/, ""), comment: text.slice(i).replace(/\s+$/, "")};
        }
    }
    return {body: text.replace(/\s+$/, ""), comment: null};
}

const TABLE_HEADER_RE = /^\s*(\[{1,2})\s*(.+?)\s*(\]{1,2})\s*$/;

/** Count bracket depth delta on a line, outside quotes/comments. */
function bracketDelta(text: string): number {
    const {body} = splitComment(text);
    let inS = false;
    let inD = false;
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (inS) {
            if (ch === "'") inS = false;
            continue;
        }
        if (inD) {
            if (ch === '"') inD = false;
            continue;
        }
        if (ch === "'") {
            inS = true;
            continue;
        }
        if (ch === '"') {
            inD = true;
            continue;
        }
        if (ch === "[") depth++;
        else if (ch === "]") depth--;
    }
    return depth;
}

type ParsedLine =
    | { t: "header"; header: string; comment: string | null }
    | { t: "kv"; key: string; value: string; comment: string | null }
    | { t: "raw"; text: string }
    | { t: "blank" };

/** AUTO-FORMAT — the tidy pass (see header doc). */
export function formatToml(text: string, options: TomlFormatOptions = {}): string {
    const alignEquals = options.alignEquals ?? true;
    const finalNewline = options.finalNewline ?? true;
    const raw = text.replace(/\r\n?/g, "\n").split("\n");

    // ── 1. classify every line ────────────────────────────────────
    const parsed: ParsedLine[] = [];
    let depth = 0; // open multiline-array bracket depth
    let inTriple: '"""' | "'''" | null = null;

    for (const line of raw) {
        const trimmed = line.trim();

        // inside a multiline string → byte-for-byte
        if (inTriple) {
            if (trimmed.includes(inTriple)) inTriple = null;
            parsed.push({t: "raw", text: line.replace(/\s+$/, "")});
            continue;
        }

        if (depth > 0) {
            const delta = bracketDelta(trimmed);
            parsed.push({t: "raw", text: line.replace(/\s+$/, "")});
            depth = Math.max(0, depth + delta);
            continue;
        }

        if (trimmed === "") {
            parsed.push({t: "blank"});
            continue;
        }

        // multiline string opener?
        const triple = trimmed.includes('"""') ? '"""' as const : trimmed.includes("'''") ? "'''" as const : null;
        // table header?
        const header = TABLE_HEADER_RE.exec(trimmed);
        if (header && header[1].length === header[3].length) {
            const after = trimmed.slice(header[0].length).trim();
            const comment = after.startsWith("#") ? after : null;
            parsed.push({t: "header", header: `${header[1]}${header[2]}${header[3]}`, comment});
            continue;
        }

        // key = value?
        const kv = /^([A-Za-z0-9_"'.\-[\]]+?)\s*=\s*(.*)$/.exec(trimmed);
        if (kv) {
            const {body, comment} = splitComment(kv[2]);
            parsed.push({t: "kv", key: kv[1], value: body.trim(), comment});
            depth = Math.max(0, bracketDelta(kv[2]));
            if (triple && bracketDelta(kv[2]) === 0) inTriple = triple;
            continue;
        }

        if (triple) {
            inTriple = triple;
        }
        parsed.push({t: "raw", text: line.replace(/\s+$/, "")});
    }

    // ── 2. rebuild: alignment runs + blank-line rules ────────────
    const out: string[] = [];
    let run: Array<{ key: string; value: string; comment: string | null }> = [];

    const flushRun = () => {
        if (run.length === 0) return;
        // Width clamp: keys longer than 30 chars used to produce a
        // NEGATIVE repeat count (RangeError — the whole format pass
        // crashed on long dotted keys); the padding now clamps at 0 so
        // those lines simply skip the column alignment.
        const width = alignEquals
            ? Math.min(30, Math.max(...run.map((r) => r.key.length)))
            : -1;
        for (const r of run) {
            const cmt = r.comment ? ` ${r.comment}` : "";
            if (width >= 0) out.push(`${r.key}${" ".repeat(Math.max(0, Math.min(width, 30) - r.key.length))} = ${r.value}${cmt}`);
            else out.push(`${r.key} = ${r.value}${cmt}`);
        }
        run = [];
    };

    for (const item of parsed) {
        if (item.t === "kv") {
            run.push({key: item.key, value: item.value, comment: item.comment});
            continue;
        }
        flushRun();
        if (item.t === "header") {
            if (out.length > 0 && out[out.length - 1] !== "") out.push("");
            out.push(`${item.header}${item.comment ? ` ${item.comment}` : ""}`);
            continue;
        }
        if (item.t === "blank") {
            if (out.length > 0 && out[out.length - 1] !== "") out.push("");
            continue;
        }
        out.push(item.text);
    }
    flushRun();

    // ── 3. collapse blank runs, single trailing newline ───────────
    const cleaned: string[] = [];
    for (const line of out) {
        if (line === "" && cleaned.length > 0 && cleaned[cleaned.length - 1] === "") continue;
        cleaned.push(line);
    }
    while (cleaned.length > 0 && cleaned[cleaned.length - 1] === "") cleaned.pop();
    const joined = cleaned.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/** AUTO-INDENT — multiline-array indentation only:
 *   ▸ the opening `key = [` line keeps its own indentation
 *   ▸ items inside get baseIndent + depth × indentWidth spaces
 *   ▸ closing brackets return to the matching column
 *   ▸ lines inside multiline strings are byte-for-byte
 *   ▸ everything else is left identical. */
export function reindentToml(text: string, options: TomlFormatOptions = {}): string {
    const w = Math.max(1, Math.min(8, options.indentWidth ?? 2));
    const raw = text.replace(/\r\n?/g, "\n").split("\n");
    const out: string[] = [];

    let depth = 0;      // open bracket depth
    let baseIndent = 0; // indentation of the line that opened the array
    let inTriple: '"""' | "'''" | null = null;

    for (const line of raw) {
        const trimmed = line.trim();
        const lead = line.slice(0, line.length - trimmed.length).replace(/\t/g, " ").length;
        const trailingTrimmed = line.replace(/\s+$/, "");

        // inside a multiline string → byte-for-byte
        if (inTriple) {
            if (trimmed.includes(inTriple)) inTriple = null;
            out.push(trailingTrimmed);
            continue;
        }

        if (depth === 0) {
            const delta = bracketDelta(trimmed);
            const triple = trimmed.includes('"""') ? '"""' as const : trimmed.includes("'''") ? "'''" as const : null;
            if (triple && delta === 0) {
                inTriple = triple;
            }
            if (delta > 0) baseIndent = lead;
            out.push(trailingTrimmed);
            depth = Math.max(0, delta);
            continue;
        }

        // inside a multiline array
        const delta = bracketDelta(trimmed);
        const newDepth = Math.max(0, depth + delta);
        if (delta < 0 && trimmed.startsWith("]")) {
            // closing line → back to the column implied by remaining depth
            out.push(`${" ".repeat(baseIndent + newDepth * w)}${trimmed}`);
        } else if (trimmed === "") {
            out.push("");
        } else {
            // item / nested content line
            out.push(`${" ".repeat(baseIndent + depth * w)}${trimmed}`);
        }
        depth = newDepth;
        if (depth === 0) baseIndent = 0;
    }

    return `${out.join("\n").replace(/\n+$/, "\n")}`;
}
