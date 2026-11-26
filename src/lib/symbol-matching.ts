/**
 * symbol-matching.ts — symbol-aware occurrence matching for the
 * project-wide rename flow (and any future cross-file refactor).
 *
 * The OLD rename was a blind `\bname\b` regex replace over every file
 * that full-text-search happened to return. That hit comments, string
 * literals, and (with case-sensitive \b) shadowed-but-unrelated
 * identifiers of the same spelling, with no way to see what would be
 * touched. This module replaces that blind pass with a three-layer
 * matcher:
 *
 *   1. WHOLE-WORD + EXACT-CASE scanning of the raw text — a candidate
 *      must be delimited by non-identifier characters on both sides,
 *      so `totalizer` never matches a rename of `total`.
 *   2. PYTHON COMMENT/STRING CLASSIFICATION — for `.py` files the
 *      candidate's offset is tested against the prose spans produced
 *      by scanPyCommentStringSpans (the same battle-tested scanner
 *      the spell-checker uses). Occurrences inside `# …` comments or
 *      string literals are reported with context "comment"/"string"
 *      so the preview dialog can show them UNCHECKED by default —
 *      visible (the safety net), but never silently rewritten.
 *   3. DEF-SITE DETECTION — parsePythonSymbols (the symbol index)
 *      marks the occurrence that IS the `def name(` / `class name`
 *      declaration, so the preview can badge definition sites vs uses.
 *
 * Everything here is PURE STRING WORK — no DOM, no node APIs — so the
 * same code runs in the browser (preview dialog re-verification before
 * write), in the API route (/api/rename-preview project scan), and in
 * the vitest suite. File names are treated as forward-slash relative
 * paths ("sub/dir/file.py") so Windows projects behave identically.
 */

import {parsePythonSymbols, type PythonSymbol} from "@/lib/python-symbols";
import {lineStarts} from "@/lib/refactor";
import {type ProseSpan, scanPyCommentStringSpans} from "@/lib/spell-spans";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

/** Where the occurrence sits. "text" = non-Python file (no classifier). */
export type OccurrenceContext = "code" | "comment" | "string" | "text";

/** One whole-word, exact-case occurrence of `name` in a source buffer. */
export interface SymbolOccurrence {
    /** 0-based character offset of the match start (into `source`). */
    start: number;
    /** Exclusive end offset (`start + name.length`). */
    end: number;
    /** 1-based line of the match. */
    line: number;
    /** 1-based character column of the match start on its line. */
    col: number;
    /** The full text of the line the occurrence is on (context snippet). */
    lineText: string;
    context: OccurrenceContext;
    /** True when this occurrence is the `def name(`/`class name` site
     *  (Python only — from the symbol index). */
    defSite: boolean;
}

/* ================================================================== */
/*  File-type helpers                                                  */
/* ================================================================== */

/** Python source extensions the matcher's classifier supports. */
const PY_EXTS = /\.(?:py|pyw)$/i;

/**
 * True for Python source files (`.py` / `.pyw`). Accepts a bare name
 * ("utils.py") or a forward-slash relative path ("pkg/sub/utils.py") —
 * nested paths arrive from the explorer's path-encoded slugs.
 */
export function isPythonSourceFile(fileName: string): boolean {
    if (!fileName) return false;
    const base = fileName.includes("/") ? fileName.slice(fileName.lastIndexOf("/") + 1) : fileName;
    return PY_EXTS.test(base);
}

/* ================================================================== */
/*  Whole-word scanning                                                */
/* ================================================================== */

/** Characters that can neighbor a Python identifier. */
const IDENT_CHAR = /[A-Za-z0-9_]/;

/**
 * All whole-word, exact-case (case-SENSITIVE — renames are refs, not
 * prose) occurrences of `name` in `haystack`. A match is whole-word
 * only when neither neighbor is an identifier character, which kills
 * `prefixname` / `name_suffix` / `name.attr` member hits.
 */
export function findWholeWordMatches(haystack: string, name: string): Array<{ start: number; end: number }> {
    const out: Array<{ start: number; end: number }> = [];
    if (!name || !haystack) return out;
    let from = 0;
    for (; ;) {
        const pos = haystack.indexOf(name, from);
        if (pos === -1) break;
        from = pos + name.length;
        const before = pos > 0 ? haystack[pos - 1] : "";
        const after = pos + name.length < haystack.length ? haystack[pos + name.length] : "";
        // `name` is itself an identifier (validated upstream), so any
        // identifier neighbor means a LONGER/dotted token — not our symbol.
        if (before && IDENT_CHAR.test(before)) continue;
        if (after && IDENT_CHAR.test(after)) continue;
        out.push({start: pos, end: pos + name.length});
    }
    return out;
}

/* ================================================================== */
/*  Occurrence finder                                                  */

/* ================================================================== */

/**
 * Offset → {line, col} for a 0-based offset, using a precomputed
 * line-start table. `starts` must be sorted ascending (lineStarts is).
 */
function lineColOf(starts: number[], offset: number): { line: number; col: number } {
    // Binary search for the greatest line start <= offset.
    let lo = 0;
    let hi = starts.length - 1;
    let found = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (starts[mid] <= offset) {
            found = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return {line: found + 1, col: offset - starts[found] + 1};
}

/**
 * Absolute offset of the NAME token on a def/class line, or -1. Only
 * the first spelling after the keyword counts — on `def foo(foo=foo)`
 * the FIRST `foo` is the declaration, the later ones are parameter
 * defaults (plain code occurrences).
 */
function defNameOffset(lineText: string, lineStart: number): number {
    // The name token begins right after the leading whitespace + the
    // `def`/`class`/`async def` keyword — the symbol index guarantees the
    // line matched that shape, so the regex's total length IS the offset
    // of the name's first character on the line.
    const m = /^(\s*)(?:async\s+)?(?:def|class)\s+/.exec(lineText);
    if (!m) return -1;
    return lineStart + m[0].length;
}

/**
 * Find every occurrence of `name` in `source`, classified and
 * def-site-tagged. Python files get the full three-layer treatment;
 * everything else gets exact-case whole-word matching with context
 * "text" (no parser — the preview checkboxes are the safety net).
 */
export function findSymbolOccurrences(
    source: string,
    name: string,
    fileName: string
): SymbolOccurrence[] {
    if (!name || !source) return [];
    const starts = lineStarts(source);
    const lines = source.split("\n");
    const matches = findWholeWordMatches(source, name);
    if (matches.length === 0) return [];

    const isPy = isPythonSourceFile(fileName);
    // Python-only classification inputs, built lazily ONCE per call so a
    // big file is never scanned twice without need.
    const spans: ProseSpan[] | null = isPy ? scanPyCommentStringSpans(source) : null;
    let symbols: PythonSymbol[] = [];
    if (isPy) {
        // Only the symbols NAMED like our target can mark def sites.
        symbols = parsePythonSymbols(source).filter((s) => s.name === name);
    }
    // def-site absolute offsets for this name (usually 0..2 entries).
    const defOffsets = new Set<number>();
    for (const s of symbols) {
        const lineIdx = s.line - 1;
        const lineText = lines[lineIdx] ?? "";
        const off = defNameOffset(lineText, starts[lineIdx] ?? 0);
        if (off >= 0) defOffsets.add(off);
    }

    const occurrences: SymbolOccurrence[] = [];
    for (const m of matches) {
        const {line, col} = lineColOf(starts, m.start);
        const lineText = lines[line - 1] ?? "";
        let context: OccurrenceContext = "text";
        if (isPy) {
            // Whole match must sit inside one span to count as prose — a
            // word straddling a closing quote is code-shaped, not prose.
            const inSpan = spans!.some((sp) => m.start >= sp.start && m.end <= sp.end);
            if (inSpan) {
                const sp = spans!.find((s) => m.start >= s.start && m.end <= s.end)!;
                context = sp.kind;
            } else {
                context = "code";
            }
        }
        occurrences.push({
            start: m.start,
            end: m.end,
            line,
            col,
            lineText,
            context,
            defSite: defOffsets.has(m.start),
        });
    }
    return occurrences;
}

/**
 * Replace exactly the given occurrences in `source` with
 * `replacement` (the new symbol name). Occurrences are applied
 * RIGHT-TO-LEFT so earlier offsets never shift; the input set is
 * expected to come from findSymbolOccurrences (non-overlapping by
 * construction), but overlapping entries are tolerated by skipping.
 */
export function applyOccurrences(
    source: string,
    occurrences: ReadonlyArray<{ start: number; end: number }>,
    replacement: string
): string {
    if (occurrences.length === 0) return source;
    const sorted = [...occurrences].sort((a, b) => b.start - a.start);
    let out = source;
    let lastStart = Infinity;
    for (const occ of sorted) {
        if (occ.end <= occ.start || occ.start < 0 || occ.end > out.length) continue;
        if (occ.end > lastStart) continue; // overlaps a later (already applied) edit
        lastStart = occ.start;
        out = out.slice(0, occ.start) + replacement + out.slice(occ.end);
    }
    return out;
}

/**
 * Should this occurrence be checked by default in the preview?
 * Python code occurrences: yes. Python comment/string occurrences:
 * NO (they are documentation/prose — renaming a symbol must not
 * rewrite them silently; they stay visible + unchecked). Non-Python
 * ("text") files have no classifier, so everything defaults to
 * checked — the preview + per-row checkbox is the safety net there.
 * Accepts any {context} shape so server-side preview rows (which
 * carry only the serialized fields) reuse the same default.
 */
export function defaultOccurrenceSelected(occ: Pick<SymbolOccurrence, "context">): boolean {
    return occ.context === "code" || occ.context === "text";
}

/** Count occurrences per context — drives the preview's summary line.
 *  Accepts the picked shape so serialized server rows fit too. */
export function summarizeOccurrences(
    occs: ReadonlyArray<Pick<SymbolOccurrence, "context" | "defSite">>
): {
    code: number;
    comment: number;
    string: number;
    text: number;
    defSites: number;
} {
    const sum = {code: 0, comment: 0, string: 0, text: 0, defSites: 0};
    for (const o of occs) {
        sum[o.context]++;
        if (o.defSite) sum.defSites++;
    }
    return sum;
}
