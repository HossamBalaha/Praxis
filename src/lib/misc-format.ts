/**
 * offline formatters for the remaining text kinds that support
 * configuration: YAML, CSS and SQL join Markdown / HTML / TOML /
 * JSON.
 *
 * All functions are STRING → STRING and dependency-free:
 *
 * ▸ reindentYaml — snaps list/mapping indentation to the detected
 * indent unit (or the configured width). Block scalars (`|`, `>`)
 * and their body lines are frozen verbatim — their indentation is
 * part of the VALUE, never touched.
 * ▸ formatCss — a real beautifier: one declaration per line,
 * `prop: value;` spacing, selectors on their own line, @media /
 * nested blocks indented, comments and strings preserved.
 * ▸ reindentSql — statement-aware re-indentation: major clauses
 * (SELECT / FROM / WHERE / …) each start a line, continuation
 * lines indent one step, paren depth adds a step. Keyword case and
 * line content are never rewritten; quoted strings are respected
 * when scanning for statement boundaries.
 *
 * Every function leaves the final newline policy to `finalNewline`
 * (default: exactly one trailing \n, matching the other formatters).
 */

export interface MiscFormatOptions {
    /** Spaces per indent level (default 2). */
    indentWidth?: number;
    /** Ensure exactly one trailing newline (default true). */
    finalNewline?: boolean;
}

const DEFAULT_WIDTH = 2;

function finish(out: string[], finalNewline: boolean): string {
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const joined = out.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/* ──────────────────────────────────────────────────────────────────
 * YAML — re-indent only (indentation is semantic, so we SNAP to the
 * detected unit instead of recomputing depths).
 * ────────────────────────────────────────────────────────────────── */

/** Lines whose indentation is part of a block scalar value (| / >). */
function blockScalarHeader(line: string): boolean {
    const t = line.trim();
    if (!t.endsWith("|") && !t.endsWith(">") && !/^[|>][+-]?[0-9]*$/.test(t)) {
        return /:\s*(\||>)\S*\s*$/.test(t) || /^[|>][+-]?\d*$/.test(t);
    }
    return true;
}

export function reindentYaml(text: string, options: MiscFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, options.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = options.finalNewline ?? true;
    const lines = text.replace(/\r\n?/g, "\n").split("\n");

    // Detect the unit: the smallest positive leading-space count seen
    // outside block scalars (YAML files made with 2-space or 4-space
    // steps keep their step; odd 3-space files snap to the unit too).
    let minIndent = Infinity;
    let inBlock = false;
    let blockIndent = 0;
    for (const line of lines) {
        if (line.trim() === "") continue;
        const indent = line.length - line.trimStart().length;
        if (inBlock) {
            if (indent <= blockIndent && line.trim() !== "") inBlock = false;
            else continue;
        }
        if (blockScalarHeader(line)) {
            inBlock = true;
            blockIndent = indent;
            continue;
        }
        if (indent > 0 && indent < minIndent) minIndent = indent;
    }
    const unit = minIndent === Infinity ? width : minIndent;

    const out: string[] = [];
    inBlock = false;
    blockIndent = 0;
    for (const line of lines) {
        if (line.trim() === "") {
            out.push("");
            continue;
        }
        const indent = line.length - line.trimStart().length;
        if (inBlock) {
            if (indent <= blockIndent && line.trim() !== "") {
                inBlock = false;
            } else {
                out.push(line); // inside a block scalar — frozen verbatim
                continue;
            }
        }
        if (blockScalarHeader(line)) {
            inBlock = true;
            blockIndent = indent;
            out.push(line);
            continue;
        }
        const level = Math.round(indent / unit);
        out.push(`${" ".repeat(level * width)}${line.trim()}`);
    }
    return finish(out, finalNewline);
}

/* ──────────────────────────────────────────────────────────────────
 * CSS — full beautifier.
 * ────────────────────────────────────────────────────────────────── */

/** Split into tokens while keeping strings + comments intact. */
function cssTokens(src: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    let plain = "";
    while (i < src.length) {
        const ch = src[i];
        if (ch === '"' || ch === "'") {
            let j = i + 1;
            while (j < src.length && src[j] !== ch) {
                if (src[j] === "\\") j++;
                j++;
            }
            tokens.push(plain + src.slice(i, Math.min(j + 1, src.length)));
            plain = "";
            i = j + 1;
            continue;
        }
        if (ch === "/" && src[i + 1] === "*") {
            const end = src.indexOf("*/", i + 2);
            const stop = end < 0 ? src.length : end + 2;
            tokens.push(plain + src.slice(i, stop));
            plain = "";
            i = stop;
            continue;
        }
        if (ch === "{" || ch === "}" || ch === ";") {
            if (plain) {
                tokens.push(plain);
                plain = "";
            }
            tokens.push(ch);
            i++;
            continue;
        }
        plain += ch;
        i++;
    }
    if (plain) tokens.push(plain);
    return tokens;
}

/** Collapse runs of whitespace outside strings/comments to one space. */
function tidyCssText(raw: string): string {
    return raw.replace(/\s+/g, " ").trim();
}

export function formatCss(text: string, options: MiscFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, options.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = options.finalNewline ?? true;
    const src = text.replace(/\r\n?/g, "\n");
    const tokens = cssTokens(src);

    const out: string[] = [];
    let depth = 0;
    /** Pending pre-{ selector text (or a comment). */
    let selector = "";

    const pad = () => " ".repeat(depth * width);
    const pushLine = (line: string) => {
        if (line !== "") out.push(line);
    };

    for (const tok of tokens) {
        const isStruct = tok === "{" || tok === "}" || tok === ";" || tok === "";
        const text = isStruct ? tok : tidyCssText(tok);
        if (text === "") continue;

        if (text === "{") {
            const sel = selector || "&";
            pushLine(`${pad()}${sel} {`);
            selector = "";
            depth++;
            continue;
        }
        if (text === "}") {
            // A declaration without a trailing `;` before the closing brace
            // still emits (normalized WITH the `;` — valid and prettier-like).
            if (selector.trim()) {
                const parts = selector.split(":");
                let rendered = selector;
                if (parts.length === 2) {
                    const prop = parts[0].trim();
                    const value = parts[1].trim();
                    if (prop && value) rendered = `${prop}: ${value}`;
                }
                pushLine(`${pad()}${rendered};`);
                selector = "";
            }
            depth = Math.max(0, depth - 1);
            pushLine(`${pad()}}`);
            selector = "";
            continue;
        }
        if (text === ";") {
            const decl = selector;
            if (decl) {
                // Normalize `prop: value` spacing (string/comment tokens are
                // single atoms, so plain split is safe).
                const parts = decl.split(":");
                let rendered = decl;
                if (parts.length === 2 && !decl.trim().startsWith(":")) {
                    const prop = parts[0].trim();
                    const value = parts[1].trim();
                    if (prop && value) rendered = `${prop}: ${value}`;
                }
                pushLine(`${pad()}${rendered};`);
            }
            selector = "";
            continue;
        }
        // Text token — a comment stays on its own line; anything else
        // accumulates as selector/declaration text.
        if (text.startsWith("/*")) {
            if (selector.trim()) selector += " ";
            pushLine(`${pad()}${(selector + text).trim()}`);
            selector = "";
            continue;
        }
        selector = selector ? `${selector} ${text}` : text;
    }
    if (selector.trim()) pushLine(`${pad()}${selector.trim()}`);
    return finish(out, finalNewline);
}

/* ──────────────────────────────────────────────────────────────────
 * SQL — statement-aware re-indentation.
 * ────────────────────────────────────────────────────────────────── */

/** Words that start a new clause line (case-insensitive). Statement
 *  starters (CREATE / INSERT / …) only matter when they are NOT the
 *  first word; trailing words like TABLE or INTO never break a line. */
const SQL_CLAUSE_WORDS = new Set([
    "select", "from", "where", "group", "order", "having", "limit",
    "offset", "values", "union", "with", "returning", "join",
    "insert", "update", "delete", "create", "alter", "drop",
]);

/** Connectors that get their own line, indented one step deeper. */
const SQL_CONNECTORS = new Set(["and", "or", "on"]);

type SqlAtom =
    | { kind: "word"; text: string }
    | { kind: "string"; text: string }
    | { kind: "comment"; text: string }
    | { kind: "punct"; text: string };

/** Tokenize a single statement into atoms (strings + comments kept
 *  intact so their contents never influence the layout). */
function sqlAtoms(stmt: string): SqlAtom[] {
    const atoms: SqlAtom[] = [];
    let i = 0;
    let cur = "";
    const flushWord = () => {
        if (cur) {
            atoms.push({kind: "word", text: cur});
            cur = "";
        }
    };
    while (i < stmt.length) {
        const ch = stmt[i];
        if (ch === "'" || ch === '"') {
            flushWord();
            let j = i + 1;
            while (j < stmt.length && stmt[j] !== ch) {
                if (stmt[j] === "\\") j++;
                j++;
            }
            atoms.push({kind: "string", text: stmt.slice(i, Math.min(j + 1, stmt.length))});
            i = j + 1;
            continue;
        }
        if (ch === "-" && stmt[i + 1] === "-") {
            flushWord();
            const nl = stmt.indexOf("\n", i);
            const stop = nl < 0 ? stmt.length : nl;
            atoms.push({kind: "comment", text: stmt.slice(i, stop)});
            i = stop;
            continue;
        }
        if (ch === "/" && stmt[i + 1] === "*") {
            flushWord();
            const end = stmt.indexOf("*/", i + 2);
            const stop = end < 0 ? stmt.length : end + 2;
            atoms.push({kind: "comment", text: stmt.slice(i, stop)});
            i = stop;
            continue;
        }
        if (/[A-Za-z0-9_$]/.test(ch)) {
            cur += ch;
            i++;
            continue;
        }
        flushWord();
        if (ch.trim() !== "") atoms.push({kind: "punct", text: ch});
        i++;
    }
    flushWord();
    return atoms;
}

/** Split source into statements on `;` outside quoted strings. */
function splitSqlStatements(src: string): string[] {
    const parts: string[] = [];
    let cur = "";
    let quote: string | null = null;
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (quote) {
            cur += ch;
            if (ch === quote && src[i - 1] !== "\\") quote = null;
            i++;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            cur += ch;
            i++;
            continue;
        }
        if (ch === "-" && src[i + 1] === "-") {
            const nl = src.indexOf("\n", i);
            const stop = nl < 0 ? src.length : nl;
            cur += src.slice(i, stop);
            i = stop;
            continue;
        }
        if (ch === "/" && src[i + 1] === "*") {
            const end = src.indexOf("*/", i + 2);
            const stop = end < 0 ? src.length : end + 2;
            cur += src.slice(i, stop);
            i = stop;
            continue;
        }
        if (ch === ";") {
            parts.push(cur);
            cur = "";
            i++;
            continue;
        }
        cur += ch;
        i++;
    }
    parts.push(cur);
    return parts;
}

export function reindentSql(text: string, options: MiscFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, options.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = options.finalNewline ?? true;
    const hadFinalSemi = /;[\s]*$/.test(text.trim());
    const statements = splitSqlStatements(text.replace(/\r\n?/g, "\n"));

    const renderedStatements: string[] = [];
    for (const stmt of statements) {
        if (!stmt.trim()) continue;
        const atoms = sqlAtoms(stmt);
        const lines: string[] = [];
        let depth = 0;
        let line = "";
        let first = true;
        const indent = (n: number) => " ".repeat(Math.max(0, n) * width);

        const flushLine = () => {
            // trimEnd only — the LEADING indent is the layout we just built
            // (trim here used to flatten every clause back to column 0).
            if (line.trim() !== "") lines.push(line.replace(/\s+$/, ""));
            line = "";
        };

        /** Join punctuation to the line with SQL-typical spacing:
         *  no space before ) , . or after (. — everything else spaced. */
        let prev: SqlAtom | null = null;
        const joinAtom = (text: string) => {
            const noSpaceBefore = text === ")" || text === "," || text === ".";
            const noSpaceAfterPrev = prev?.kind === "punct" && (prev.text === "(" || prev.text === ".");
            const hasLine = line.trim() !== "";
            line = hasLine && !noSpaceBefore && !noSpaceAfterPrev
                ? `${line} ${text}`
                : line + text;
        };

        for (const atom of atoms) {
            if (atom.kind === "comment") {
                flushLine();
                lines.push(`${indent(1)}${atom.text.trim()}`);
                prev = atom;
                continue;
            }
            if (atom.kind === "string") {
                joinAtom(atom.text);
                first = false;
                prev = atom;
                continue;
            }
            if (atom.kind === "punct") {
                if (atom.text === "(") {
                    joinAtom("(");
                    depth++;
                    first = false;
                    prev = atom;
                    continue;
                }
                if (atom.text === ")") {
                    depth = Math.max(0, depth - 1);
                    joinAtom(")");
                    first = false;
                    prev = atom;
                    continue;
                }
                if (atom.text === ",") {
                    joinAtom(",");
                    flushLine();
                    line = indent(depth + 1);
                    prev = atom;
                    continue;
                }
                // Dots, operators and other punctuation join the line.
                joinAtom(atom.text);
                first = false;
                prev = atom;
                continue;
            }
            // word
            const lower = atom.text.toLowerCase();
            if (!first && SQL_CLAUSE_WORDS.has(lower)) {
                flushLine();
                line = indent(1) + atom.text;
                first = false;
                prev = atom;
                continue;
            }
            if (!first && SQL_CONNECTORS.has(lower)) {
                flushLine();
                line = indent(2) + atom.text;
                first = false;
                prev = atom;
                continue;
            }
            // Keep a preset indent (the comma continuation), else join.
            if (line.trim() === "") {
                line = line + atom.text;
            } else {
                const noSpaceAfterPrev = prev?.kind === "punct" && (prev.text === "(" || prev.text === ".");
                line = noSpaceAfterPrev ? `${line}${atom.text}` : `${line} ${atom.text}`;
            }
            first = false;
            prev = atom;
        }
        flushLine();
        if (lines.length === 0) continue;
        lines[lines.length - 1] += ";";
        renderedStatements.push(lines.join("\n"));
    }

    const body = renderedStatements.join("\n\n");
    return finalNewline ? `${body}\n` : body;
}
