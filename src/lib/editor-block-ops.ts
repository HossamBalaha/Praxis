/**
 * Pure text/block operations for the code viewer's edit-mode line
 * utilities (src/components/code-viewer.tsx): comment toggling,
 * duplicate / delete / join / split / sort / unique / reverse /
 * shuffle, trailing-whitespace trims, word-range expansion, surround
 * pairs, identifier case conversion, literal find-replace and the
 * caret/offset geometry those commands share.
 *
 * Every function is pure (strings and numbers in and out, zero React,
 * zero DOM) so the textarea callbacks in the component shrink to thin
 * adapters: read the textarea, call one helper, write the result back
 * (see __tests__/editor-block-ops.test.ts).
 */

/** A completed buffer edit: the new content plus the selection the
 *  operation leaves behind. Null = the op changed nothing (the
 *  caller leaves the buffer untouched). */
export interface BlockEdit {
    content: string;
    selStart: number;
    selEnd: number;
}

/** The delimiter pairs "Surround Selection" can wrap around a range. */
export type SurroundKind = "quotes" | "parens" | "brackets" | "braces";

const SURROUND_PAIRS: Record<SurroundKind, [string, string]> = {
    quotes: ['"', '"'],
    parens: ["(", ")"],
    brackets: ["[", "]"],
    braces: ["{", "}"],
};

/** The case styles of Convert Case (the IntelliJ CamelCase plugin /
 *  Sublime Convert Case family). */
export type CaseKind =
    | "upper"
    | "lower"
    | "title"
    | "camel"
    | "pascal"
    | "snake"
    | "kebab"
    | "constant";

/** 0-based line index containing `offset` (the line the caret is on). */
export function lineIndexOfOffset(src: string, offset: number): number {
    return src.slice(0, offset).split("\n").length - 1;
}

/** 1-based line number containing `offset`. */
export function lineNumberAtOffset(src: string, offset: number): number {
    return src.slice(0, offset).split("\n").length;
}

/** Number of "\n" characters before `offset` (a match-list length). */
export function newlineCountBefore(src: string, offset: number): number {
    return src.slice(0, offset).match(/\n/g)?.length ?? 0;
}

/**
 * The buffer offset where line index `lineIdx` starts — join of the
 * preceding lines plus the separating newline (0 for the first line).
 * Shared by every block op that re-selects the spliced region.
 */
export function offsetBeforeLine(lines: string[], lineIdx: number): number {
    return lines.slice(0, lineIdx).join("\n").length + (lineIdx > 0 ? 1 : 0);
}

/**
 * The textarea's estimated scroll position that centers the line
 * `lineNumber` (0-based): the +16 is the textarea's 1rem top inset —
 * without it the target drifts one line high on long files.
 */
export function centeredTextareaScrollTop(
    lineNumber: number,
    lineHeightPx: number,
    clientHeight: number
): number {
    return Math.max(0, 16 + lineNumber * lineHeightPx - clientHeight / 2);
}

/** Toggle `#` comments across the selected lines: when every
 *  meaningful line is already commented they are uncommented,
 *  otherwise each non-blank line is commented at its indent. Blank
 *  lines are never touched. Null when the toggle changes nothing. */
export function togglePythonComments(
    src: string,
    selStart: number,
    selEnd: number
): BlockEdit | null {
    const startLineIdx = lineIndexOfOffset(src, selStart);
    const endLineIdx = lineIndexOfOffset(src, selEnd);
    const lines = src.split("\n");
    const block = lines.slice(startLineIdx, endLineIdx + 1);
    const meaningful = block.filter((l) => l.trim().length > 0);
    const allCommented =
        meaningful.length > 0 && meaningful.every((l) => /^[ \t]*#/.test(l));
    const updated = block.map((l) => {
        if (l.trim().length === 0) return l;
        if (allCommented) return l.replace(/^([ \t]*)#[ \t]?/, "$1");
        const m = l.match(/^([ \t]*)/);
        const indent = m ? m[1] : "";
        return `${indent}# ${l.slice(indent.length)}`;
    });
    if (updated.join("\n") === block.join("\n")) return null;
    const newLines = [...lines.slice(0, startLineIdx), ...updated, ...lines.slice(endLineIdx + 1)];
    const before = offsetBeforeLine(newLines, startLineIdx);
    return {
        content: newLines.join("\n"),
        selStart: before,
        selEnd: before + updated.join("\n").length,
    };
}

/** Duplicate the selected block directly below itself; the selection
 *  lands on the fresh copy. */
export function duplicateLinesBlock(
    src: string,
    selStart: number,
    selEnd: number
): BlockEdit {
    const startLineIdx = lineIndexOfOffset(src, selStart);
    const endLineIdx = lineIndexOfOffset(src, selEnd);
    const lines = src.split("\n");
    const block = lines.slice(startLineIdx, endLineIdx + 1);
    const newLines = [
        ...lines.slice(0, startLineIdx),
        ...block,
        ...block,
        ...lines.slice(endLineIdx + 1),
    ];
    const before = offsetBeforeLine(lines, startLineIdx);
    const blockLen = block.join("\n").length;
    return {
        content: newLines.join("\n"),
        selStart: before + blockLen + 1,
        selEnd: before + 2 * blockLen + 1,
    };
}

/** Delete the selected lines (or the caret's line when nothing is
 *  selected); the caret lands where the block was. Null for a
 *  one-line buffer (there would be nothing left to edit). */
export function deleteLinesBlock(
    src: string,
    selStart: number,
    selEnd: number
): BlockEdit | null {
    const startLineIdx = lineIndexOfOffset(src, selStart);
    const endLineIdx = lineIndexOfOffset(src, selEnd);
    const lines = src.split("\n");
    if (lines.length <= 1) return null;
    const newLines = [...lines.slice(0, startLineIdx), ...lines.slice(endLineIdx + 1)];
    const before = offsetBeforeLine(newLines, startLineIdx);
    return {content: newLines.join("\n"), selStart: before, selEnd: before};
}

/** Join the selected lines into one (trimmed halves, single spaces);
 *  with the caret on a single line, join it with the NEXT line. Null
 *  when there is nothing to join (last line, single-line selection). */
export function joinLinesBlock(
    src: string,
    selStart: number,
    selEnd: number
): BlockEdit | null {
    const startLineIdx = lineIndexOfOffset(src, selStart);
    const endLineIdx = lineIndexOfOffset(src, selEnd);
    const lines = src.split("\n");
    if (endLineIdx >= lines.length - 1 && startLineIdx === endLineIdx) return null;
    const blockEnd = startLineIdx === endLineIdx ? endLineIdx + 1 : endLineIdx;
    const block = lines.slice(startLineIdx, blockEnd + 1);
    const joined = block.map((l) => l.trim()).filter((l) => l.length > 0).join(" ");
    const newLines = [...lines.slice(0, startLineIdx), joined, ...lines.slice(blockEnd + 1)];
    const before = offsetBeforeLine(newLines, startLineIdx);
    return {
        content: newLines.join("\n"),
        selStart: before,
        selEnd: before + joined.length,
    };
}

/** Split the selected block at commas into one trimmed item per line
 *  — the Join twin. Null when the block has no comma to split on. */
export function splitLinesBlock(
    src: string,
    selStart: number,
    selEnd: number
): BlockEdit | null {
    const startLineIdx = lineIndexOfOffset(src, selStart);
    const endLineIdx = lineIndexOfOffset(src, selEnd);
    const lines = src.split("\n");
    const block = lines.slice(startLineIdx, endLineIdx + 1);
    const split = block.flatMap((l) => l.split(",")).map((part) => part.trim());
    if (split.length <= 1) return null;
    const newLines = [...lines.slice(0, startLineIdx), ...split, ...lines.slice(endLineIdx + 1)];
    const before = offsetBeforeLine(newLines, startLineIdx);
    return {
        content: newLines.join("\n"),
        selStart: before,
        selEnd: before + split.join("\n").length,
    };
}

/** Sort the selected lines alphabetically (case-insensitive, on the
 *  trimmed text). Null for a single-line selection or an already
 *  sorted block. */
export function sortLinesBlock(
    src: string,
    selStart: number,
    selEnd: number
): BlockEdit | null {
    const startLineIdx = lineIndexOfOffset(src, selStart);
    const endLineIdx = lineIndexOfOffset(src, selEnd);
    if (startLineIdx === endLineIdx) return null;
    const lines = src.split("\n");
    const block = lines.slice(startLineIdx, endLineIdx + 1);
    const sorted = [...block].sort((a, b) =>
        a.trim().toLowerCase().localeCompare(b.trim().toLowerCase())
    );
    if (sorted.join("\n") === block.join("\n")) return null;
    const newLines = [...lines.slice(0, startLineIdx), ...sorted, ...lines.slice(endLineIdx + 1)];
    const before = offsetBeforeLine(newLines, startLineIdx);
    return {
        content: newLines.join("\n"),
        selStart: before,
        selEnd: before + sorted.join("\n").length,
    };
}

/** Transform the selected multi-line block with `fn` and re-select
 *  the transformed lines. Null for a single-line selection or when
 *  `fn` changes nothing. */
export function transformLinesBlock(
    src: string,
    selStart: number,
    selEnd: number,
    fn: (block: string[]) => string[]
): BlockEdit | null {
    const startLineIdx = lineIndexOfOffset(src, selStart);
    const endLineIdx = lineIndexOfOffset(src, selEnd);
    if (startLineIdx === endLineIdx) return null;
    const lines = src.split("\n");
    const block = lines.slice(startLineIdx, endLineIdx + 1);
    const out = fn(block);
    if (out.join("\n") === block.join("\n")) return null;
    const newLines = [...lines.slice(0, startLineIdx), ...out, ...lines.slice(endLineIdx + 1)];
    const before = offsetBeforeLine(newLines, startLineIdx);
    return {
        content: newLines.join("\n"),
        selStart: before,
        selEnd: before + out.join("\n").length,
    };
}

/** Deduplicate the block (first occurrence wins, compared trimmed). */
export function uniqueLines(block: string[]): string[] {
    const seen = new Set<string>();
    return block.filter((l) => {
        const key = l.trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Reverse the block's line order. */
export function reverseLines(block: string[]): string[] {
    return [...block].reverse();
}

/** Fisher-Yates shuffle (injectable rng so tests stay deterministic). */
export function shuffleLines(
    block: string[],
    rng: () => number = Math.random
): string[] {
    const out = [...block];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/** Strip trailing spaces/tabs from every line (blank-safe, keeps the
 *  line structure). Returns the trimmed buffer — compare against the
 *  source to know whether anything changed. */
export function trimTrailingWhitespace(src: string): string {
    return src
        .split("\n")
        .map((l) => l.replace(/[ \t]+$/, ""))
        .join("\n");
}

/** A zero-based buffer range and its text. */
export interface TextRange {
    start: number;
    end: number;
    text: string;
}

/**
 * The word (or live selection) around a caret position: an actual
 * selection is returned as-is; otherwise the identifier-ish word
 * ([A-Za-z0-9_$]) around the caret. Null when the caret sits between
 * non-word characters with nothing selected.
 */
export function wordRangeAround(src: string, start: number, end: number): TextRange | null {
    if (start !== end) return {start, end, text: src.slice(start, end)};
    const wordChars = /[\w$]/;
    let s = start;
    while (s > 0 && wordChars.test(src[s - 1])) s--;
    let e = end;
    while (e < src.length && wordChars.test(src[e])) e++;
    if (s === e) return null;
    return {start: s, end: e, text: src.slice(s, e)};
}

/**
 * Expand a (possibly collapsed) range to the word at the caret — the
 * range "Surround Selection" wraps when nothing is selected. Null
 * when there is no word there.
 */
export function expandRangeToWord(
    src: string,
    start: number,
    end: number
): { start: number; end: number } | null {
    if (start !== end) return {start, end};
    const wordChars = /[\w$]/;
    let s = start;
    let e = end;
    while (s > 0 && wordChars.test(src[s - 1])) s--;
    while (e < src.length && wordChars.test(src[e])) e++;
    if (s === e) return null;
    return {start: s, end: e};
}

/** Wrap [start, end) in the delimiter pair; the selection lands on
 *  the wrapped content (inside the delimiters). Null when the range
 *  is collapsed and no word surrounds it. */
export function surroundRange(
    src: string,
    start: number,
    end: number,
    kind: SurroundKind
): BlockEdit | null {
    const range = expandRangeToWord(src, start, end);
    if (!range) return null;
    const [open, close] = SURROUND_PAIRS[kind];
    const next =
        src.slice(0, range.start) + open + src.slice(range.start, range.end) + close + src.slice(range.end);
    return {
        content: next,
        selStart: range.start + open.length,
        selEnd: range.end + open.length,
    };
}

/**
 * Convert an identifier's case style. Identifier-style conversions
 * split into words on case boundaries + separators, then rejoin per
 * style; `title` capitalizes every word of prose. Null when there
 * are no words to convert or the conversion is a no-op (the caller
 * leaves the buffer untouched).
 */
export function convertIdentifierCase(text: string, kind: CaseKind): string | null {
    let converted: string;
    if (kind === "upper") {
        converted = text.toUpperCase();
    } else if (kind === "lower") {
        converted = text.toLowerCase();
    } else if (
        kind === "camel" ||
        kind === "pascal" ||
        kind === "snake" ||
        kind === "kebab" ||
        kind === "constant"
    ) {
        const words = text
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
            .split(/[\s_\-.]+/)
            .filter(Boolean);
        if (words.length === 0) return null;
        if (kind === "snake") converted = words.join("_").toLowerCase();
        else if (kind === "kebab") converted = words.join("-").toLowerCase();
        else if (kind === "constant") converted = words.join("_").toUpperCase();
        else if (kind === "pascal")
            converted = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
        else
            converted = words
                .map((w, i) =>
                    i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                )
                .join("");
    } else {
        converted = text.replace(/\p{L}[\p{L}\p{Nd}_]*/gu, (w) =>
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        );
    }
    if (converted === text) return null;
    return converted;
}

/** The full text of the line containing `offset` (no newline). */
export function lineTextAt(src: string, offset: number): string {
    const lineStart = src.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
    const lineEnd = src.indexOf("\n", offset);
    return src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
}

/**
 * The code "Run Selection" should execute: the live selection when
 * one exists, else the caret's whole line (PyCharm behavior), trimmed.
 * Empty string means there is nothing to run.
 */
export function runSelectionText(src: string, start: number, end: number): string {
    if (start !== end) return src.slice(start, end).trim();
    return lineTextAt(src, start).trim();
}

/** Escape regex metacharacters so a literal needle can be compiled. */
export function escapeRegExpLiteral(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace every (case-insensitive) literal occurrence of `findText`
 * with `replaceText` — the split-and-join-free twin of Replace All
 * that still treats the needle as a literal, never a pattern.
 */
export function replaceAllLiteral(
    content: string,
    findText: string,
    replaceText: string
): string {
    const regex = new RegExp(escapeRegExpLiteral(findText), "gi");
    return content.replace(regex, replaceText);
}
