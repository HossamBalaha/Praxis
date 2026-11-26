/**
 * a compact JSONPath subset for the JSON inspector.
 *
 * Supported syntax (enough for everyday drilling):
 *   $                  the root document
 *   .name  or  ['name']  object member
 *   [0]                array index (negative = from the end)
 *   [*]  or  .*        wildcard over members / elements
 *   ..name             recursive descent to every matching key
 *   [?(@.price > 10)]  filter: == != > < >= <= on @.key or @
 *                       (string literals in single/double quotes,
 *                       numbers, booleans)
 *   [1:5]  or  [1:5:2] slice (start:end[:step], negatives allowed)
 *
 * Returns { values, paths } so the UI can show WHERE each match came
 * from. Throws JsonPathError on malformed input — the caller shows the
 * message inline.
 */

export interface JsonPathMatch {
    path: string;
    value: unknown;
}

export class JsonPathError extends Error {
}

type Token =
    | { t: "root" }
    | { t: "child"; name: string }
    | { t: "index"; n: number }
    | { t: "wild" }
    | { t: "recurse"; name: string }
    | { t: "filter"; key: string | null; op: string; lit: string | number | boolean }
    | { t: "slice"; start?: number; end?: number; step?: number };

function tokenize(expr: string): Token[] {
    const src = expr.trim();
    if (!src.startsWith("$")) {
        throw new JsonPathError("A JSONPath must start with '$'.");
    }
    const tokens: Token[] = [{t: "root"}];
    let i = 1;
    while (i < src.length) {
        const ch = src[i];
        if (ch === ".") {
            if (src[i + 1] === ".") {
                // recursive descent  ..name
                i += 2;
                const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
                if (!m) throw new JsonPathError("Expected a name after '..'.");
                tokens.push({t: "recurse", name: m[0]});
                i += m[0].length;
            } else {
                i++;
                if (src[i] === "*") {
                    tokens.push({t: "wild"});
                    i++;
                } else {
                    const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
                    if (!m) throw new JsonPathError("Expected a name after '.'.");
                    tokens.push({t: "child", name: m[0]});
                    i += m[0].length;
                }
            }
        } else if (ch === "[") {
            const close = findBracketEnd(src, i);
            const inner = src.slice(i + 1, close).trim();
            i = close + 1;
            if (inner === "*") {
                tokens.push({t: "wild"});
            } else if (/^-?\d+$/.test(inner)) {
                tokens.push({t: "index", n: parseInt(inner, 10)});
            } else if (/^'.*'$/.test(inner) || /^".*"$/.test(inner)) {
                tokens.push({t: "child", name: inner.slice(1, -1)});
            } else if (inner.startsWith("?")) {
                tokens.push(parseFilter(inner));
            } else if (inner.includes(":")) {
                const parts = inner.split(":");
                if (parts.length > 3) throw new JsonPathError("Bad slice (max 3 parts).");
                const nums = parts.map((p) => (p.trim() === "" ? undefined : parseInt(p.trim(), 10)));
                if (nums.some((n) => n !== undefined && Number.isNaN(n))) {
                    throw new JsonPathError("Bad slice numbers.");
                }
                tokens.push({t: "slice", start: nums[0], end: nums[1], step: nums[2]});
            } else {
                throw new JsonPathError(`Unsupported bracket expression [${inner}].`);
            }
        } else if (ch === " ") {
            i++;
        } else {
            throw new JsonPathError(`Unexpected character '${ch}' at ${i}.`);
        }
    }
    return tokens;
}

function findBracketEnd(src: string, from: number): number {
    let depth = 0;
    for (let i = from; i < src.length; i++) {
        if (src[i] === "[") depth++;
        if (src[i] === "]") {
            depth--;
            if (depth === 0) return i;
        }
    }
    throw new JsonPathError("Unbalanced brackets.");
}

function parseFilter(inner: string): Token {
    // ?(@.key > 10) | ?(@ == "x") | ?(@.a.b == 1) — we support one level.
    const m =
        /^\?\(\s*@(?:\.([A-Za-z_$][\w$]*))?\s*(==|!=|>=|<=|>|<)\s*(.+)\s*\)$/.exec(
            inner
        );
    if (!m) {
        throw new JsonPathError(
            "Filters support one comparison, e.g. [?(@.price > 10)] or [?(@ == \"ok\")]."
        );
    }
    const rawLit = m[3].trim();
    let lit: string | number | boolean;
    if (
        (rawLit.startsWith("'") && rawLit.endsWith("'")) ||
        (rawLit.startsWith('"') && rawLit.endsWith('"'))
    ) {
        lit = rawLit.slice(1, -1);
    } else if (rawLit === "true" || rawLit === "false") {
        lit = rawLit === "true";
    } else if (/^-?\d+(\.\d+)?$/.test(rawLit)) {
        lit = Number(rawLit);
    } else {
        throw new JsonPathError(`Bad filter literal: ${rawLit}`);
    }
    return {t: "filter", key: m[1] ?? null, op: m[2], lit};
}

function pathLabel(path: (string | number)[]): string {
    let out = "$";
    for (const seg of path) {
        if (typeof seg === "number") out += `[${seg}]`;
        else if (/^[A-Za-z_$][\w$]*$/.test(seg)) out += `.${seg}`;
        else out += `['${seg}']`;
    }
    return out;
}

interface Cursor {
    value: unknown;
    path: (string | number)[];
}

function applyToken(cur: Cursor, tok: Token): Cursor[] {
    switch (tok.t) {
        case "root":
            return [cur];
        case "child": {
            if (cur.value !== null && typeof cur.value === "object" && !Array.isArray(cur.value)) {
                const v = (cur.value as Record<string, unknown>)[tok.name];
                if (v !== undefined) return [{value: v, path: [...cur.path, tok.name]}];
            }
            return [];
        }
        case "index": {
            if (Array.isArray(cur.value)) {
                const idx = tok.n < 0 ? cur.value.length + tok.n : tok.n;
                if (idx >= 0 && idx < cur.value.length) {
                    return [{value: cur.value[idx], path: [...cur.path, idx]}];
                }
            }
            return [];
        }
        case "wild": {
            if (Array.isArray(cur.value)) {
                return cur.value.map((v, i) => ({value: v, path: [...cur.path, i]}));
            }
            if (cur.value !== null && typeof cur.value === "object") {
                return Object.entries(cur.value as Record<string, unknown>).map(([k, v]) => ({
                    value: v,
                    path: [...cur.path, k],
                }));
            }
            return [];
        }
        case "recurse": {
            const found: Cursor[] = [];
            const walk = (node: unknown, path: (string | number)[], seen: Set<unknown>) => {
                if (node === null || typeof node !== "object" || seen.has(node)) return;
                seen.add(node);
                if (Array.isArray(node)) {
                    node.forEach((v, i) => walk(v, [...path, i], seen));
                } else {
                    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
                        if (k === tok.name) found.push({value: v, path: [...path, k]});
                        walk(v, [...path, k], seen);
                    }
                }
            };
            walk(cur.value, cur.path, new Set());
            return found;
        }
        case "filter": {
            if (!Array.isArray(cur.value)) return [];
            return cur.value
                .map((v, i) => ({value: v, path: [...cur.path, i]}))
                .filter(({value}) => {
                    const lhs = tok.key
                        ? value !== null && typeof value === "object"
                            ? (value as Record<string, unknown>)[tok.key as string]
                            : undefined
                        : value;
                    if (lhs === undefined || lhs === null) return false;
                    const rhs = tok.lit;
                    if (typeof lhs === "number" && typeof rhs === "number") {
                        switch (tok.op) {
                            case "==":
                                return lhs === rhs;
                            case "!=":
                                return lhs !== rhs;
                            case ">":
                                return lhs > rhs;
                            case "<":
                                return lhs < rhs;
                            case ">=":
                                return lhs >= rhs;
                            case "<=":
                                return lhs <= rhs;
                        }
                    }
                    const l = String(lhs);
                    const r = String(rhs);
                    switch (tok.op) {
                        case "==":
                            return l === r;
                        case "!=":
                            return l !== r;
                        case ">":
                            return l > r;
                        case "<":
                            return l < r;
                        case ">=":
                            return l >= r;
                        case "<=":
                            return l <= r;
                    }
                    return false;
                });
        }
        case "slice": {
            if (!Array.isArray(cur.value)) return [];
            const arr = cur.value;
            const step = tok.step && tok.step !== 0 ? tok.step : 1;
            const len = arr.length;
            const norm = (n: number | undefined, dflt: number) =>
                n === undefined ? dflt : n < 0 ? Math.max(len + n, 0) : Math.min(n, len);
            const start = norm(tok.start, step > 0 ? 0 : len - 1);
            const end = norm(tok.end, step > 0 ? len : -1);
            const outSel: Cursor[] = [];
            if (step > 0) {
                for (let i = start; i < end; i += step) {
                    outSel.push({value: arr[i], path: [...cur.path, i]});
                }
            } else {
                for (let i = start; i > end; i += step) {
                    if (i >= 0 && i < len) outSel.push({value: arr[i], path: [...cur.path, i]});
                }
            }
            return outSel;
        }
    }
    return [];
}

/** Evaluate a JSONPath expression against a parsed document. */
export function queryJsonPath(root: unknown, expr: string): JsonPathMatch[] {
    const tokens = tokenize(expr);
    let cursors: Cursor[] = [{value: root, path: []}];
    for (const tok of tokens) {
        const next: Cursor[] = [];
        for (const cur of cursors) {
            next.push(...applyToken(cur, tok));
        }
        cursors = next;
        if (cursors.length === 0) break;
    }
    return cursors.map((c) => ({path: pathLabel(c.path), value: c.value}));
}

/** Human label for a JSON value's TYPE (drives the tree's type badges). */
export function jsonTypeOf(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return `array(${value.length})`;
    if (typeof value === "object") return `object(${Object.keys(value).length})`;
    return typeof value;
}
