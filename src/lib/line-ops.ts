/**
 * line-ops.ts — the generic line-editing transforms shared by the
 * editors' right-click Edit ▸ menus (the Python CodeViewer has had
 * Toggle comment / Duplicate line / Move lines / Sort… for a while;
 * these pure helpers bring the SAME utilities to every other
 * language's editor so the menus stay option-for-option consistent).
 *
 * Every op is a pure (text, selection) → (text, selection) transform
 * — no React, no side effects.
 */

export interface LineOpResult {
    text: string;
    /** The new caret/selection range in the rewritten text. */
    start: number;
    end: number;
}

/** The line comment token for a file kind (undefined = no comment
 *  toggling, e.g. plain text where a `#` would be wrong). */
export function commentTokenFor(kind: string): string | undefined {
    switch (kind) {
        case "python":
        case "yaml":
        case "toml":
        case "r":
        case "shell":
        case "perl":
        case "ruby":
        case "elixir":
        case "julia":
            return "#";
        case "javascript":
        case "typescript":
        case "java":
        case "c":
        case "cpp":
        case "css":
        case "go":
        case "rust":
        case "swift":
        case "kotlin":
        case "zig":
        case "dart":
        case "groovy":
        case "scala":
        case "graphql":
            return "//";
        case "matlab":
            return "%";
        case "sql":
            return "--";
        case "lua":
            return "--";
        case "haskell":
        case "erlang":
            return "--";
        case "clojure":
            return ";";
        case "powershell":
            return "#";
        case "batch":
            return "REM ";
        case "html":
            return undefined; // <!-- --> — too structural to toggle safely
        case "markdown":
            return undefined; // comments are not a markdown construct
        case "json":
            return undefined; // JSON has no comments
        case "ocaml":
        case "fsharp":
            return "//";
        default:
            return undefined;
    }
}

function lineBounds(text: string, sel: { start: number; end: number }) {
    const first = text.lastIndexOf("\n", Math.min(sel.start, sel.end) - 1) + 1;
    let lastEnd = Math.max(sel.start, sel.end);
    if (lastEnd < text.length && text[lastEnd] !== "\n") {
        lastEnd = text.indexOf("\n", lastEnd);
        if (lastEnd === -1) lastEnd = text.length;
    }
    return {first, lastEnd};
}

/** Toggle the line comment on every line touching the selection. */
export function toggleComment(
    text: string,
    sel: { start: number; end: number },
    token: string
): LineOpResult {
    const {first, lastEnd} = lineBounds(text, sel);
    const block = text.slice(first, lastEnd);
    const lines = block.split("\n");
    const trimmed = token.trim();
    const allCommented = lines
        .filter((l) => l.trim() !== "")
        .every((l) => l.trimStart().startsWith(trimmed));
    const out = lines
        .map((l) => {
            if (l.trim() === "") return l; // blank lines stay blank
            if (allCommented) {
                return l.replace(new RegExp(`^(\\s*)${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s?`), "$1");
            }
            const indent = l.match(/^\s*/)?.[0] ?? "";
            return indent + token.trimEnd() + " " + l.slice(indent.length);
        })
        .join("\n");
    return {text: text.slice(0, first) + out + text.slice(lastEnd), start: first, end: first + out.length};
}

/** Duplicate every line touching the selection (caret lands on the
 *  fresh copy, like the Python editor's behavior). */
export function duplicateLines(text: string, sel: { start: number; end: number }): LineOpResult {
    const {first, lastEnd} = lineBounds(text, sel);
    const block = text.slice(first, lastEnd);
    const withCopy = block + "\n" + block;
    const caret = first + block.length + 1 + (sel.start - first);
    return {text: text.slice(0, first) + withCopy + text.slice(lastEnd), start: caret, end: caret};
}

/** Move the selected line block up (delta -1) or down (+1). */
export function moveLines(
    text: string,
    sel: { start: number; end: number },
    delta: -1 | 1
): LineOpResult {
    const {first, lastEnd} = lineBounds(text, sel);
    if (delta === -1) {
        if (first === 0) return {text, start: sel.start, end: sel.end};
        const prevStart = text.lastIndexOf("\n", first - 2) + 1;
        const prev = text.slice(prevStart, first - 1);
        const block = text.slice(first, lastEnd);
        const merged = prevStart + block.length + 1;
        return {
            text: text.slice(0, prevStart) + block + "\n" + prev + text.slice(lastEnd),
            start: prevStart,
            end: merged,
        };
    }
    if (lastEnd >= text.length) return {text, start: sel.start, end: sel.end};
    let nextEnd = text.indexOf("\n", lastEnd + 1);
    if (nextEnd === -1) nextEnd = text.length;
    const next = text.slice(lastEnd + 1, nextEnd);
    const block = text.slice(first, lastEnd);
    return {
        text: text.slice(0, first) + next + "\n" + block + text.slice(nextEnd),
        start: first,
        end: first + next.length + 1 + block.length,
    };
}

/** Delete every line touching the selection. */
export function deleteLines(text: string, sel: { start: number; end: number }): LineOpResult {
    const {first, lastEnd} = lineBounds(text, sel);
    const eatNewline = lastEnd < text.length ? 1 : 0; // swallow the line's \n
    const start = first > 0 ? first : 0;
    const caret = Math.min(start, Math.max(0, text.length - (lastEnd + eatNewline - first)));
    return {
        text: text.slice(0, first) + text.slice(lastEnd + eatNewline),
        start: caret,
        end: caret,
    };
}

/** Join the selected lines into one (space-separated, like the Python
 *  editor's Join Lines). */
export function joinLines(text: string, sel: { start: number; end: number }): LineOpResult {
    const {first, lastEnd} = lineBounds(text, sel);
    const block = text.slice(first, lastEnd);
    const joined = block
        .split("\n")
        .map((l, i) => (i === 0 ? l.replace(/\s+$/, "") : l.trim()))
        .filter((l, i, arr) => !(l === "" && arr.length > 1))
        .join(" ");
    return {text: text.slice(0, first) + joined + text.slice(lastEnd), start: first, end: first + joined.length};
}

/** Order-transforms over the selected lines (sort / unique / reverse
 *  / shuffle). A caret-only selection applies to the caret's line. */
export type LineOrderOp = "sort" | "unique" | "reverse" | "shuffle";

export function reorderLines(
    text: string,
    sel: { start: number; end: number },
    op: LineOrderOp
): LineOpResult {
    const {first, lastEnd} = lineBounds(text, sel);
    const lines = text.slice(first, lastEnd).split("\n");
    let out: string[];
    switch (op) {
        case "sort":
            out = [...lines].sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"}));
            break;
        case "unique": {
            const seen = new Set<string>();
            out = lines.filter((l) => (l === "" ? true : seen.has(l) ? false : (seen.add(l), true)));
            break;
        }
        case "reverse":
            out = [...lines].reverse();
            break;
        case "shuffle": {
            out = [...lines];
            for (let i = out.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [out[i], out[j]] = [out[j], out[i]];
            }
            break;
        }
    }
    const joined = out.join("\n");
    return {text: text.slice(0, first) + joined + text.slice(lastEnd), start: first, end: first + joined.length};
}

/** Trim trailing whitespace across the whole buffer. */
export function trimTrailingWhitespaceAll(text: string): string {
    return text.replace(/[ \t]+(?=\r?\n)/g, "").replace(/[ \t]+$/, "");
}
