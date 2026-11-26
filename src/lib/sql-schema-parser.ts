/**
 * parse SQL DDL (CREATE TABLE statements) into
 * the same TableInfo shape the SQLite workbench's ER diagram uses —
 * so .sql schema files get the same graphical view as live .db files.
 * Pure client-side, no server round-trip.
 */

export interface SqlColumnInfo {
    name: string;
    type: string;
    pk?: boolean;
}

export interface SqlForeignKey {
    from: string;
    table: string;
    to: string;
}

export interface SqlTableInfo {
    name: string;
    type: "table";
    columns: SqlColumnInfo[];
    rows: null;
    fks: SqlForeignKey[];
}

export interface SqlSchema {
    tables: SqlTableInfo[];
    /** Statements seen but not represented (views, indexes…). */
    skipped: string[];
}

/** Remove `-- line` and `/* block *​/` comments (string literals are
 *  preserved — comments inside quotes stay untouched). */
export function stripSqlComments(src: string): string {
    let out = "";
    let i = 0;
    let quote: string | null = null;
    while (i < src.length) {
        const ch = src[i];
        if (quote) {
            out += ch;
            if (ch === quote) quote = null;
            i++;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === "`") {
            quote = ch;
            out += ch;
            i++;
            continue;
        }
        if (ch === "-" && src[i + 1] === "-") {
            while (i < src.length && src[i] !== "\n") i++;
            continue;
        }
        if (ch === "/" && src[i + 1] === "*") {
            i += 2;
            while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
            i += 2;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

/** Unquote `"name"` / `` `name` `` / `[name]`` and drop a schema prefix
 * (`dbo.Users` → `Users`). */
export function unquoteIdent(raw: string): string {
    let s = raw.trim();
    const schemaSplit = s.split(".");
    if (schemaSplit.length > 1) s = schemaSplit[schemaSplit.length - 1];
    if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("`") && s.endsWith("`")) ||
        (s.startsWith("[") && s.endsWith("]"))
    ) {
        s = s.slice(1, -1);
    }
    return s;
}

/** Extract the balanced (…) body starting at `open` index; returns
 *  [body, indexAfterClose]. Escapes nested parens (CHECK(…), types). */
function balancedBody(src: string, open: number): [string, number] {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") {
            depth--;
            if (depth === 0) return [src.slice(open + 1, i), i + 1];
        }
    }
    return [src.slice(open + 1), src.length]; // unterminated — tolerate
}

/** Split a column/constraint list on TOP-LEVEL commas only. */
export function splitTopLevel(body: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let cur = "";
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (quote) {
            cur += ch;
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === "`") {
            quote = ch;
            cur += ch;
            continue;
        }
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
            parts.push(cur);
            cur = "";
            continue;
        }
        cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    return parts.map((p) => p.trim()).filter(Boolean);
}

const FK_INLINE = /REFERENCES\s+([A-Za-z0-9_"'\[\]`$.]+)(?:\s*\(([^)]*)\))?/i;

/** Parse one `CREATE TABLE` statement body into a SqlTableInfo. */
function parseCreateTable(name: string, body: string): SqlTableInfo {
    const table: SqlTableInfo = {name, type: "table", columns: [], rows: null, fks: []};
    /** The same relation is often declared twice (inline REFERENCES +
     *  a table-level FOREIGN KEY) — one edge each on the diagram. */
    const pushFk = (fk: SqlForeignKey) => {
        if (!table.fks.some((f) => f.from === fk.from && f.table === fk.table && f.to === fk.to)) {
            table.fks.push(fk);
        }
    };
    const pkNames = new Set<string>();
    for (const part of splitTopLevel(body)) {
        const upper = part.toUpperCase();
        // Table-level PRIMARY KEY (a, b)
        if (upper.startsWith("PRIMARY KEY")) {
            const inner = balancedBody(part, part.indexOf("("));
            for (const col of inner[0].split(",")) {
                const c = unquoteIdent(col);
                if (c) pkNames.add(c);
            }
            continue;
        }
        // Table-level FOREIGN KEY (col) REFERENCES t (col)
        if (upper.startsWith("FOREIGN KEY")) {
            const colMatch = part.match(/\(([^)]*)\)/);
            const ref = part.match(FK_INLINE);
            if (colMatch && ref) {
                const to = ref[2] ? unquoteIdent(ref[2].split(",")[0]) : "";
                pushFk({
                    from: unquoteIdent(colMatch[1]),
                    table: unquoteIdent(ref[1]),
                    to: to || "id",
                });
            }
            continue;
        }
        // Skip other table-level constraints
        if (
            upper.startsWith("CONSTRAINT") ||
            upper.startsWith("UNIQUE") ||
            upper.startsWith("CHECK") ||
            upper.startsWith("INDEX") ||
            upper.startsWith("KEY") ||
            upper.startsWith("EXCLUDE")
        ) {
            continue;
        }
        // Column definition: `name TYPE[(…)] [constraints…]`
        const m = part.match(/^([A-Za-z0-9_$]+|"[^"]+"|`[^`]+`|\[[^\]]+\])\s+([A-Za-z0-9_$]+(?:\s*\([^)]*\))?)([\s\S]*)$/);
        if (!m) continue;
        const colName = unquoteIdent(m[1]);
        const colTypeRaw = m[2].replace(/\s+/g, " ").trim();
        const rest = (m[3] ?? "").toUpperCase();
        const isPk = /\bPRIMARY\s+KEY\b/.test(rest);
        if (isPk) pkNames.add(colName);
        const inlineRef = (m[3] ?? "").match(FK_INLINE);
        if (inlineRef) {
            const to = inlineRef[2] ? unquoteIdent(inlineRef[2].split(",")[0]) : "";
            pushFk({
                from: colName,
                table: unquoteIdent(inlineRef[1]),
                to: to || "id",
            });
        }
        // keep the type's
        // modifiers — VARCHAR(80), NUMERIC(10,2) — so the ORM generators
        // can emit max_length / precision; consumers that want the bare
        // keyword match with /^TYPE/ regexes anyway (sqlalchemyType).
        const colType =
            colTypeRaw.replace(/\s+/g, "").toUpperCase() || "TEXT";
        table.columns.push({name: colName, type: colType, pk: isPk});
    }
    if (pkNames.size > 0) {
        table.columns = table.columns.map((c) => (pkNames.has(c.name) ? {...c, pk: true} : c));
    }
    return table;
}

/** Parse every CREATE TABLE in a .sql script → ER-diagram-ready tables. */
export function parseSqlSchema(src: string): SqlSchema {
    const clean = stripSqlComments(src);
    const skipped: string[] = [];
    const tables: SqlTableInfo[] = [];
    // The identifier may be quoted ("order items" / `tags` / [tags])
    // or bare, optionally schema-qualified (dbo.Users).
    const re =
        /CREATE\s+(TABLE|VIEW|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z0-9_$.]+))/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean)) !== null) {
        const kind = m[1].toUpperCase();
        const name = unquoteIdent(m[2] ?? m[3] ?? m[4] ?? m[5] ?? "");
        if (kind === "TABLE") {
            const open = clean.indexOf("(", m.index + m[0].length);
            if (open === -1) continue;
            const [body] = balancedBody(clean, open);
            tables.push(parseCreateTable(name, body));
        } else {
            skipped.push(`${kind} ${name}`);
        }
    }
    return {tables, skipped};
}
