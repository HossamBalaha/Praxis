/**
 * Indentation settings engine —.
 *
 * generated files (Examples + Insert blocks) follow a
 * configurable indentation: spaces or tabs, with a specific width
 * (Settings → Editor → Indentation; default 2 spaces).
 *
 * Every template in the codebase is authored in a CANONICAL 4-space
 * indent. `reindent` converts that canonical form into whatever the
 * user configured — per line, using multiples of 4 as indent levels, so
 * a 2-space user gets half-width blocks and a tab user gets real `\t`
 * characters. Only PYTHON examples/blocks are re-indented: Makefiles
 * require literal tabs, YAML/TOML indentation is semantic, and text
 * files don't care, so those keep their authored layout.
 *
 * The conversion is level-exact (level = floor(leadingSpaces / 4)),
 * so a template block at depth 2 (8 spaces) becomes 2 units in the
 * target style — Python's "consistent within a block" rule always holds.
 * Remainder spaces (aligned continuations inside brackets, docstring
 * content) are preserved verbatim and are never block indentation.
 */

export type IndentStyleName = "spaces" | "tab";

export interface IndentSettings {
    /** Spaces vs literal tab characters. */
    style: IndentStyleName;
    /** Spaces per indent level (ignored when style = "tab"). 2 / 4 / 8. */
    width: number;
}

/** Templates are authored with this many spaces per level. */
export const CANONICAL_INDENT_STEP = 4;

/** Default: 2 spaces. */
export const DEFAULT_INDENT_SETTINGS: IndentSettings = {
    style: "spaces",
    width: 2,
};

/** The string one indent level is made of. */
export function indentUnitOf(s: IndentSettings): string {
    if (s.style === "tab") return "\t";
    const w = Number.isFinite(s.width) ? Math.max(1, Math.min(8, Math.round(s.width))) : 2;
    return " ".repeat(w);
}

/** Read the IndentSettings bundle from a Settings object (duck-typed so
 *  the lib doesn't import the whole settings module). */
export function getIndentSettings(settings: {
    indentStyle?: IndentStyleName;
    editorIndentWidth?: number;
}): IndentSettings {
    return {
        style: settings.indentStyle === "tab" ? "tab" : "spaces",
        width:
            Number.isFinite(settings.editorIndentWidth) && (settings.editorIndentWidth as number) > 0
                ? (settings.editorIndentWidth as number)
                : DEFAULT_INDENT_SETTINGS.width,
    };
}

/**
 * Convert canonical 4-space indentation to the configured style.
 * Pure function over whole lines — safe to run on any text; call it for
 * Python content only (see header note).
 */
export function reindent(code: string, s: IndentSettings): string {
    // Canonical form — nothing to do.
    if (s.style === "spaces" && s.width === CANONICAL_INDENT_STEP) return code;
    const unit = indentUnitOf(s);
    return code
        .split("\n")
        .map((line) => {
            const lead = /^[ ]*/.exec(line)?.[0]?.length ?? 0;
            if (lead === 0) return line;
            const body = line.slice(lead);
            // Whitespace-only lines collapse to empty (no trailing indent).
            if (body === "") return "";
            const level = Math.floor(lead / CANONICAL_INDENT_STEP);
            const rest = lead % CANONICAL_INDENT_STEP;
            // Remainder spaces (alignment continuations, docstring content)
            // are preserved verbatim — they are never block indentation.
            return unit.repeat(level) + " ".repeat(rest) + body;
        })
        .join("\n");
}

/** True when a file should receive indentation conversion (Python only). */
export function isReindentableFile(fileName: string): boolean {
    return /\.pyw?$/i.test(fileName);
}

/**
 * — "Auto indent" engine.
 *
 * Normalizes an ARBITRARY file's indentation to the configured style,
 * unlike `reindent` which converts from the canonical 4-space form.
 * The source file may use any width (2/3/4/8 spaces, or tabs), so the
 * indent unit is DETECTED first:
 *   - if any line starts with a literal tab → the source is tab-indented
 *     (unit = one tab);
 *   - otherwise the unit is the most common leading-space run length
 *     among indented lines (ties → smaller width), defaulting to 4.
 *
 * Each line's level = floor(leadingWidth / srcUnit); the remainder
 * (alignment continuations) is preserved verbatim in spaces, exactly
 * like `reindent`, so Python's "consistent within a block" rule
 * always holds and aligned brackets stay aligned.
 */
export function detectIndentUnit(code: string): { style: IndentStyleName; width: number } {
    const lines = code.split("\n");
    if (lines.some((l) => l.startsWith("\t"))) return {style: "tab", width: 1};
    const counts = new Map<number, number>();
    for (const line of lines) {
        const lead = /^[ ]+/.exec(line)?.[0]?.length ?? 0;
        if (lead > 0) counts.set(lead, (counts.get(lead) ?? 0) + 1);
    }
    if (counts.size === 0) return {style: "spaces", width: 4};
    // Most common leading run; ties broken toward the smaller width.
    let best = 4;
    let bestCount = -1;
    for (const [width, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
        if (count > bestCount) {
            best = width;
            bestCount = count;
        }
    }
    return {style: "spaces", width: Math.max(1, Math.min(8, best))};
}

/** Convert arbitrary `code` to the target indentation style. Pure. */
export function autoIndent(code: string, target: IndentSettings): string {
    const src = detectIndentUnit(code);
    const srcUnit = src.style === "tab" ? "\t" : " ".repeat(src.width);
    const srcUnitWidth = src.style === "tab" ? 1 : src.width;
    const dstUnit = indentUnitOf(target);
    if (srcUnit === dstUnit) return code; // already the target style
    return code
        .split("\n")
        .map((line) => {
            const leadMatch = /^([ \t]*)/.exec(line)?.[0] ?? "";
            if (leadMatch === "") return line;
            const body = line.slice(leadMatch.length);
            if (body === "") return ""; // whitespace-only line
            // Compute the leading whitespace's width in "source units".
            let units = 0;
            let extraSpaces = 0;
            let i = 0;
            while (i < leadMatch.length) {
                if (leadMatch[i] === "\t") {
                    units += 1;
                    i += 1;
                } else {
                    // A run of spaces shorter than the source unit is a partial
                    // level (alignment) — kept as remainder spaces, verbatim,
                    // exactly like reindent does.
                    let run = 0;
                    while (i < leadMatch.length && leadMatch[i] === " ") {
                        run++;
                        i++;
                    }
                    units += Math.floor(run / srcUnitWidth);
                    extraSpaces += run % srcUnitWidth;
                }
            }
            return dstUnit.repeat(units) + " ".repeat(extraSpaces) + body;
        })
        .join("\n");
}

// ─── syntactic Python re-indenter ───────────────────
//
// "auto indent for files is not working as i added
// more indentation in a certain function/class and it keeps that while
// i configured only 2 spaces". The old `autoIndent` only CONVERTED
// units (4-space source → 2-space target) — it preserved each line's
// LEVEL, so extra manual indentation survived untouched.
//
// `reindentPython` recomputes every line's level from the actual
// Python BLOCK STRUCTURE, like CPython's tools/reindent.py:
//
// • A logical line that ends with `:` at bracket depth 0 opens a
// block (def / class / if / elif / else / for / while / try /
// except / finally / with / match / case — uniformly, no keyword
// list needed).
// • A line's SOURCE level (its leading width in the file's own
// indent unit) closes blocks: while srcLevel < openBlocks, pop.
// This is what makes else / elif / except / finally / case and
// plain statements after a nested block land at the right depth.
// • The EMITTED level is the open-block count after popping — so a
// line the user over-indented (srcLevel above the true structure)
// is pulled back onto the structural grid, expressed in the
// CONFIGURED unit (2 spaces by default).
// • Bracket continuations and backslash continuations keep their
// RELATIVE alignment: they shift by the same column delta as the
// first physical line of their logical line.
// • Standalone comments snap to the nearest open block (clamped);
// they never open or close blocks.
// • Blank lines collapse to empty; the interior of multi-line
// strings is emitted VERBATIM (touching it would change the
// string's value).
//
// The scanner is string/comment/bracket-aware (single/double/triple
// quotes, raw/f/b prefixes, backslash escapes) so a `:` or `#` inside
// a string can never fake a block opener.

/** Visual column width of a leading-whitespace string (tab = 8, Python's rule). */
function leadColumns(lead: string): number {
    let cols = 0;
    for (const ch of lead) cols += ch === "\t" ? 8 : 1;
    return cols;
}

/** Find the closing `delim` (a triple-quote sequence) in `line` at or
 * after `from`, honoring backslash escapes. -1 when not found. */
function findTripleClose(line: string, from: number, delim: string): number {
    for (let i = from; i <= line.length - 3; i++) {
        if (line[i] === "\\") {
            i++;
            continue;
        }
        if (line.startsWith(delim, i)) return i;
    }
    return -1;
}

/** Result of scanning ONE physical line for structure. */
interface LineScan {
    /** Bracket depth after this line (carries across continuation lines). */
    depth: number;
    /** Open triple-quote delimiter after this line (null = none). */
    triple: string | null;
    /** Last significant char is `:` at depth 0, outside strings/comments. */
    endsWithColon: boolean;
    /** Last significant char is a backslash (explicit continuation). */
    endsWithBackslash: boolean;
}

/** Scan one physical line of Python, starting from the given bracket
 * depth and triple-string state. Pure — mutates nothing. */
function scanPythonLine(line: string, depth0: number, triple0: string | null): LineScan {
    let depth = depth0;
    let triple = triple0;
    let endsWithColon = false;
    let endsWithBackslash = false;
    let lastSig = "";
    let inStr: string | null = null; // single-line string quote char
    let i = 0;
    while (i < line.length) {
        if (triple) {
            const close = findTripleClose(line, i, triple);
            if (close === -1) return {depth, triple, endsWithColon: false, endsWithBackslash: false};
            i = close + 3;
            triple = null;
            lastSig = '"';
            continue;
        }
        const ch = line[i];
        if (inStr) {
            if (ch === "\\") {
                i += 2;
                continue;
            }
            if (ch === inStr) {
                inStr = null;
                lastSig = ch;
            }
            i++;
            continue;
        }
        if (ch === "#") break; // comment — rest of the line is inert
        if (ch === '"' || ch === "'") {
            const seq = line.slice(i, i + 3);
            if (seq === '"""' || seq === "'''") {
                const close = findTripleClose(line, i + 3, seq);
                if (close === -1) {
                    // Triple string stays open into the following lines.
                    return {depth, triple: seq, endsWithColon: false, endsWithBackslash: false};
                }
                i = close + 3;
                lastSig = '"';
                continue;
            }
            inStr = ch;
            i++;
            continue;
        }
        if (ch === "(" || ch === "[" || ch === "{") {
            depth++;
            lastSig = ch;
            i++;
            continue;
        }
        if (ch === ")" || ch === "]" || ch === "}") {
            depth = Math.max(0, depth - 1);
            lastSig = ch;
            i++;
            continue;
        }
        if (!/\s/.test(ch)) lastSig = ch;
        i++;
    }
    endsWithColon = lastSig === ":" && depth === 0 && !inStr;
    endsWithBackslash = lastSig === "\\";
    return {depth, triple, endsWithColon, endsWithBackslash};
}

/**
 * Re-indent a Python file to the configured style by recomputing each
 * line's BLOCK level (see the block comment above). Pure function.
 */
export function reindentPython(code: string, target: IndentSettings): string {
    const rawLines = code.split("\n");

    // ── Pass 1: classify every physical line + collect code-line leads.
    type Kind = "blank" | "string" | "cont" | "comment" | "code";

    interface Rec {
        kind: Kind;
        lead: string;
        body: string;
        colon: boolean
    }

    const recs: Rec[] = [];
    let depth = 0;
    let triple: string | null = null;
    let backslash = false;
    // Lead (columns) of the most recent colon-terminated code line — the
    // NEXT code line's lead minus this is the file's block STEP, the most
    // reliable unit signal there is (a body sits exactly one unit under
    // its header; over-indented bodies give 2×, which loses the vote).
    let prevColonLead: number | null = null;
    const stepDiffs = new Map<number, number>();
    for (const raw of rawLines) {
        if (triple) {
            recs.push({kind: "string", lead: "", body: raw, colon: false});
            const close = findTripleClose(raw, 0, triple);
            if (close !== -1) triple = null;
            continue;
        }
        const lead = /^([ \t]*)/.exec(raw)?.[1] ?? "";
        const body = raw.slice(lead.length);
        if (body === "") {
            recs.push({kind: "blank", lead, body, colon: false});
            continue;
        }
        if (depth > 0 || backslash) {
            const r = scanPythonLine(body, depth, null);
            depth = r.depth;
            backslash = r.endsWithBackslash && !r.triple;
            recs.push({kind: "cont", lead, body, colon: false});
            continue;
        }
        const isComment = body.startsWith("#");
        const r = scanPythonLine(body, depth, null);
        depth = r.depth;
        backslash = r.endsWithBackslash;
        if (r.triple) {
            // The string opens here and runs on — the following lines are
            // string-interior (verbatim). This line itself is still a code
            // line for level purposes (a docstring's first line).
            triple = r.triple;
            const leadCols = leadColumns(lead);
            if (!isComment) {
                if (prevColonLead !== null) {
                    const d = leadCols - prevColonLead;
                    if (d > 0) stepDiffs.set(d, (stepDiffs.get(d) ?? 0) + 1);
                }
                prevColonLead = r.endsWithColon ? leadCols : null;
            }
            recs.push({kind: isComment ? "comment" : "code", lead, body, colon: r.endsWithColon});
            continue;
        }
        const leadCols = leadColumns(lead);
        if (!isComment) {
            if (prevColonLead !== null) {
                const d = leadCols - prevColonLead;
                if (d > 0) stepDiffs.set(d, (stepDiffs.get(d) ?? 0) + 1);
            }
            prevColonLead = r.endsWithColon ? leadCols : null;
        }
        recs.push({kind: isComment ? "comment" : "code", lead, body, colon: r.endsWithColon && !isComment});
    }

    // ── Detect the SOURCE unit. Primary signal: the most common STEP
    //    between a colon header and the next code line (the actual block
    //    step of THIS file — immune to docstring/continuation leads that
    //    skewed the plain most-common-lead heuristic on small files).
    //    Fallback: most common positive code-lead. Ties → smaller.
    const hasTab = recs.some((r) => r.kind === "code" && r.lead.includes("\t"));
    const srcUnitWidth = hasTab ? 1 : (() => {
        const pickMostCommon = (m: Map<number, number>): number | null => {
            if (m.size === 0) return null;
            let best = -1;
            let bestCount = -1;
            for (const [w, c] of [...m.entries()].sort((a, b) => a[0] - b[0])) {
                if (c > bestCount) {
                    best = w;
                    bestCount = c;
                }
            }
            return best;
        };
        const step = pickMostCommon(stepDiffs);
        if (step !== null && step >= 1) return Math.min(8, step);
        const counts = new Map<number, number>();
        for (const r of recs) {
            if (r.kind !== "code" || r.lead === "") continue;
            const cols = leadColumns(r.lead);
            if (cols > 0) counts.set(cols, (counts.get(cols) ?? 0) + 1);
        }
        const fallback = pickMostCommon(counts);
        return Math.max(1, Math.min(8, fallback ?? 4));
    })();

    // Source level of a lead, in the source unit (tab-indented sources:
    // each tab is one level; space runs are divided by the unit width).
    const leadUnits = (lead: string): number => {
        let units = 0;
        let i = 0;
        while (i < lead.length) {
            if (lead[i] === "\t") {
                units++;
                i++;
                continue;
            }
            let run = 0;
            while (i < lead.length && lead[i] === " ") {
                run++;
                i++;
            }
            units += Math.floor(run / srcUnitWidth);
        }
        return units;
    };

    // ── Pass 2: emit.
    const dstUnit = indentUnitOf(target);
    const dstUnitCols = target.style === "tab" ? 8 : indentUnitOf(target).length;
    let openBlocks = 0;
    let pendingDelta: number | null = null; // column shift for continuations
    const out: string[] = [];
    for (const rec of recs) {
        switch (rec.kind) {
            case "blank":
                out.push("");
                continue;
            case "string":
                out.push(rec.body); // verbatim — string content is sacred
                continue;
            case "cont": {
                const delta = pendingDelta ?? 0;
                if (delta === 0) {
                    out.push(rec.lead + rec.body);
                    continue;
                }
                const newCols = Math.max(0, leadColumns(rec.lead) + delta);
                out.push(" ".repeat(newCols) + rec.body);
                continue;
            }
            case "comment": {
                // Snap comments to the open-block grid, clamped to the range
                // the file actually has open (never open/close blocks).
                const lvl = Math.max(0, Math.min(leadUnits(rec.lead), openBlocks));
                out.push(dstUnit.repeat(lvl) + rec.body);
                continue;
            }
            case "code": {
                const srcLevel = leadUnits(rec.lead);
                // Close blocks the source says are closed.
                while (openBlocks > 0 && srcLevel < openBlocks) openBlocks--;
                const emittedCols = openBlocks * dstUnitCols;
                out.push(dstUnit.repeat(openBlocks) + rec.body);
                pendingDelta = emittedCols - leadColumns(rec.lead);
                if (rec.colon) openBlocks++;
                continue;
            }
        }
    }
    return out.join("\n");
}
