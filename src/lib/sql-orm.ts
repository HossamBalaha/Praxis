/**
 * ORM model generation from a parsed SQL schema.
 *
 * The graphical schema view of a database/tables/scheme: the ER
 * diagram shows the connections; this module renders the ORM DESIGN
 * side — SQLAlchemy 2.0
 * declarative models generated client-side from the same parsed DDL
 * (lib/sql-schema-parser), plus a human-readable relations report.
 */

import type {SqlForeignKey, SqlTableInfo} from "./sql-schema-parser";

/** PascalCase class name from a snake/camel/quoted table name. */
export function pascalFromSqlName(name: string): string {
    const parts = name
        .replace(/[`"[\]]/g, "")
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
    const joined = parts.map((p) => {
        const lower = p.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join("");
    return /^[0-9]/.test(joined) ? `T${joined}` : joined || "Table";
}

/** snake_case identifier from anything. */
export function snakeFromSqlName(name: string): string {
    const joined = name
        .replace(/[`"[\]]/g, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .join("_")
        .toLowerCase();
    return /^[0-9]/.test(joined) ? `t_${joined}` : joined || "t";
}

type SaType = { import: string; column: string; python: string };

/** SQL column type → (SQLAlchemy column expr, Python annotation). */
function sqlalchemyType(sqlType: string): SaType {
    const t = sqlType.toUpperCase().replace(/\s+/g, "");
    if (/^BIGINT/.test(t)) return {import: "BigInteger", column: "BigInteger", python: "int"};
    if (/^SMALLINT|^INT8/.test(t)) return {import: "SmallInteger", column: "SmallInteger", python: "int"};
    if (/^(INT|INTEGER|SERIAL|MEDIUMINT)/.test(t)) return {import: "Integer", column: "Integer", python: "int"};
    if (/^(BIG)?SERIAL/.test(t)) return {import: "BigInteger", column: "BigInteger", python: "int"};
    if (/^BOOLEAN|^BOOL|^BIT\(1\)/.test(t)) return {import: "Boolean", column: "Boolean", python: "bool"};
    if (/^NUMERIC|^DECIMAL/.test(t)) {
        const m = /\((\d+)\s*,\s*(\d+)\)/.exec(t);
        return m
            ? {import: "Numeric", column: `Numeric(${m[1]}, ${m[2]})`, python: "Decimal"}
            : {import: "Numeric", column: "Numeric", python: "Decimal"};
    }
    if (/^REAL|^FLOAT|^DOUBLE/.test(t)) return {import: "Float", column: "Float", python: "float"};
    if (/^TIMESTAMP|^DATETIME/.test(t)) return {import: "DateTime", column: "DateTime", python: "datetime.datetime"};
    if (/^DATE$/.test(t)) return {import: "Date", column: "Date", python: "datetime.date"};
    if (/^TIME/.test(t)) return {import: "Time", column: "Time", python: "datetime.time"};
    if (/^INTERVAL/.test(t)) return {import: "Interval", column: "Interval", python: "datetime.timedelta"};
    if (/^JSON(JSONB)?$/.test(t)) return {import: "JSON", column: "JSON", python: "dict"};
    if (/^BLOB|^BYTEA|^VARBINARY|^BINARY/.test(t)) return {
        import: "LargeBinary",
        column: "LargeBinary",
        python: "bytes"
    };
    if (/^VARCHAR|^CHARACTERVARYING/.test(t)) {
        const m = /\((\d+)\)/.exec(t);
        return m
            ? {import: "String", column: `String(${m[1]})`, python: "str"}
            : {import: "String", column: "String", python: "str"};
    }
    if (/^(CHAR|NCHAR|CHARACTER)/.test(t)) {
        const m = /\((\d+)\)/.exec(t);
        return m
            ? {import: "String", column: `String(${m[1]})`, python: "str"}
            : {import: "String", column: "String", python: "str"};
    }
    if (/^(TEXT|CLOB|STRING|NVARCHAR|LONGTEXT|MEDIUMTEXT|TINYTEXT)/.test(t)) return {
        import: "Text",
        column: "Text",
        python: "str"
    };
    if (/^UUID/.test(t)) return {import: "Uuid", column: "Uuid", python: "uuid.UUID"};
    return {import: "Text", column: "Text", python: "str"}; // unknown → text
}

/** Deduplicate a name against taken identifiers. */
function dedupe(base: string, taken: Set<string>): string {
    if (!taken.has(base)) {
        taken.add(base);
        return base;
    }
    let i = 2;
    while (taken.has(`${base}_${i}`)) i++;
    const name = `${base}_${i}`;
    taken.add(name);
    return name;
}

/** Generate SQLAlchemy 2.0 declarative models (Mapped / mapped_column)
 *  from the parsed schema — imports, Base, one class per table,
 *  ForeignKey columns, relationship pairs with back_populates. */
export function sqlalchemyModelsFromSchema(tables: SqlTableInfo[]): string {
    if (tables.length === 0) return "-- no CREATE TABLE statements found";

    const byName = new Map(tables.map((t) => [t.name.toLowerCase(), t] as const));
    const classOf = new Map(tables.map((t) => [t.name, pascalFromSqlName(t.name)] as const));

    // ── collect the imports actually used ───────────────────────────
    const saImports = new Set<string>(["ForeignKey"]);
    const ormImports = new Set<string>(["relationship"]);

    // relationship pairing: parentName -> children (for back_populates)
    interface RelPair {
        parentTable: string;
        childTable: string;
        fk: SqlForeignKey;
        parentAttr: string; // attr on the PARENT class (list)
        childAttr: string;  // attr on the CHILD class (single)
    }

    const relPairs: RelPair[] = [];
    const parentTaken = new Map<string, Set<string>>(); // table -> taken attr names
    const childTaken = new Map<string, Set<string>>();

    for (const t of tables) {
        if (!parentTaken.has(t.name)) parentTaken.set(t.name, new Set(t.columns.map((c) => snakeFromSqlName(c.name))));
        if (!childTaken.has(t.name)) childTaken.set(t.name, new Set(t.columns.map((c) => snakeFromSqlName(c.name))));
    }

    for (const child of tables) {
        for (const fk of child.fks ?? []) {
            const parent = byName.get(fk.table.toLowerCase());
            const parentTable = parent?.name ?? fk.table;
            const childAttr = dedupe(snakeFromSqlName(parentTable), childTaken.get(child.name)!);
            const parentAttr = dedupe(
                snakeFromSqlName(child.name) + (/(s|ch|sh|x|z)$/.test(snakeFromSqlName(child.name)) ? "" : "s"),
                parentTaken.get(parentTable)!
            );
            relPairs.push({parentTable, childTable: child.name, fk, parentAttr, childAttr});
        }
    }

    const typeFor = (sqlType: string): SaType => {
        const sa = sqlalchemyType(sqlType);
        saImports.add(sa.import);
        return sa;
    };

    // ── render ───────────────────────────────────────────────────────
    const out: string[] = [];
    out.push(`"""SQLAlchemy 2.0 models generated from the schema (${new Date().toISOString().slice(0, 10)}).`);
    out.push("");
    out.push("Generated by Praxis from the parsed CREATE TABLE statements —");
    out.push("review types/nullability against your real DDL before using.");
    out.push('"""');
    out.push("from __future__ import annotations");
    out.push("");
    // PRE-PASS: collect every column type BEFORE the import lines are
    // assembled (the render loop below only *emits* them — the first
    // version assembled imports first and rendered types after, so
    // String/Integer/DateTime… never made it into the import list).
    const pythonTypes = new Set<string>();
    for (const t of tables) {
        for (const c of t.columns) {
            const sa = sqlalchemyType(c.type);
            saImports.add(sa.import);
            pythonTypes.add(sa.python);
        }
    }
    const saLines: string[] = [];
    if ([...pythonTypes].some((p) => p.startsWith("datetime."))) saLines.push("import datetime");
    if (pythonTypes.has("Decimal")) saLines.push("from decimal import Decimal");
    if (pythonTypes.has("uuid.UUID")) saLines.push("from uuid import UUID");
    saLines.push(`from sqlalchemy import ${[...saImports].sort().join(", ")}`);
    saLines.push("from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship");
    out.push(...saLines);
    out.push("");
    out.push("");
    out.push("class Base(DeclarativeBase):");
    out.push('    """Shared declarative base."""');
    out.push("");
    out.push("");

    tables.forEach((t, ti) => {
        const cls = classOf.get(t.name)!;
        out.push(`class ${cls}(Base):`);
        out.push(`    __tablename__ = ${JSON.stringify(t.name)}`);
        out.push("");
        for (const col of t.columns) {
            const attr = snakeFromSqlName(col.name);
            const sa = typeFor(col.type);
            const nullable = !col.pk;
            const fk = (t.fks ?? []).find((f) => f.from.toLowerCase() === col.name.toLowerCase());
            const parts: string[] = [];
            if (col.pk) parts.push("primary_key=True");
            if (fk) parts.push(`ForeignKey(${JSON.stringify(`${fk.table}.${fk.to}`)})`);
            const pythonType = nullable ? `${sa.python} | None` : sa.python;
            // A plain integer primary key reads cleanest without the
            // explicit type; everything else carries its column type.
            if (col.pk && !fk && sa.column === "Integer") {
                out.push(`    ${attr}: Mapped[${pythonType}] = mapped_column(primary_key=True)`);
            } else {
                const args = parts.length > 0 ? `, ${parts.join(", ")}` : "";
                out.push(`    ${attr}: Mapped[${pythonType}] = mapped_column(${sa.column}${args})`);
            }
        }
        const myRels = relPairs.filter((r) => r.parentTable === t.name || r.childTable === t.name);
        if (myRels.length > 0) {
            out.push("");
            out.push("    # relationships");
            for (const r of myRels) {
                if (r.parentTable === t.name) {
                    const childCls = classOf.get(r.childTable)!;
                    out.push(`    ${r.parentAttr}: Mapped[list["${childCls}"]] = relationship(back_populates=${JSON.stringify(r.childAttr)})`);
                } else {
                    const parentCls = byName.get(r.parentTable.toLowerCase()) ? classOf.get(r.parentTable)! : pascalFromSqlName(r.parentTable);
                    out.push(`    ${r.childAttr}: Mapped["${parentCls}"] = relationship(back_populates=${JSON.stringify(r.parentAttr)})`);
                }
            }
        }
        out.push("");
        if (ti < tables.length - 1) out.push("");
    });

    return out.join("\n").replace(/\n{3,}/g, "\n\n\n").replace(/\n*$/, "\n");
}

/** Human-readable relations report: every FK as
 *  `child.from → parent.to`, grouped by parent — the textual twin of
 *  the diagram's bezier edges. */
export function relationsReportFromSchema(tables: SqlTableInfo[]): string {
    const lines: string[] = [];
    const withFks = tables.filter((t) => (t.fks?.length ?? 0) > 0);
    if (withFks.length === 0) {
        return "No FOREIGN KEY constraints in this schema — the tables are unconnected.";
    }
    let total = 0;
    for (const child of withFks) {
        for (const fk of child.fks) {
            total++;
            const parent = tables.find((t) => t.name.toLowerCase() === fk.table.toLowerCase());
            const parentName = parent?.name ?? fk.table;
            lines.push(
                `${child.name}.${fk.from}  →  ${parentName}.${fk.to}${parent ? "" : "   (⚠ parent table not in this file)"}`
            );
        }
    }
    const header = `${total} relation${total === 1 ? "" : "s"} across ${withFks.length} table${withFks.length === 1 ? "" : "s"}`;
    return [header, "─".repeat(Math.max(header.length, 40)), ...lines.map((l) => `• ${l}`)].join("\n") + "\n";
}

/* ─── (user batch: "add more options for sql/db/etc.") ────
* Two more ORM flavors for the schema view's ORM tab, joining
* SQLAlchemy: Django models and a Prisma schema. Same parser input,
* same client-side generation. */

/** SQL column type → Django field expression. */
function djangoType(sqlType: string, isPk: boolean, fkTarget: string | null): {
    field: string;
    needsImport: string | null
} {
    const t = sqlType.toUpperCase().replace(/\s+/g, "");
    if (isPk && !fkTarget && /^BIGINT/.test(t)) return {
        field: "models.BigAutoField(primary_key=True)",
        needsImport: null
    };
    if (isPk && !fkTarget) return {field: "models.AutoField(primary_key=True)", needsImport: null};
    if (/^BIGINT|^INT8/.test(t)) return {field: "models.BigIntegerField()", needsImport: null};
    if (/^(INT|INTEGER|MEDIUMINT|SERIAL)/.test(t)) return {field: "models.IntegerField()", needsImport: null};
    if (/^SMALLINT/.test(t)) return {field: "models.SmallIntegerField()", needsImport: null};
    if (/^BOOLEAN|^BOOL/.test(t)) return {field: "models.BooleanField()", needsImport: null};
    if (/^(NUMERIC|DECIMAL)/.test(t)) {
        const m = /\((\d+)\s*,\s*(\d+)\)/.exec(t);
        return m
            ? {field: `models.DecimalField(max_digits=${m[1]}, decimal_places=${m[2]})`, needsImport: null}
            : {field: "models.DecimalField(max_digits=20, decimal_places=10)", needsImport: null};
    }
    if (/^REAL|^FLOAT|^DOUBLE/.test(t)) return {field: "models.FloatField()", needsImport: null};
    if (/^TIMESTAMP|^DATETIME/.test(t)) return {field: "models.DateTimeField()", needsImport: "django.utils.timezone"};
    if (/^DATE$/.test(t)) return {field: "models.DateField()", needsImport: null};
    if (/^TIME/.test(t)) return {field: "models.TimeField()", needsImport: null};
    if (/^DURATION|^INTERVAL/.test(t)) return {field: "models.DurationField()", needsImport: null};
    if (/^JSON(JSONB)?$/.test(t)) return {field: "models.JSONField()", needsImport: null};
    if (/^BLOB|^BYTEA|^BINARY/.test(t)) return {field: "models.BinaryField()", needsImport: null};
    if (/^UUID/.test(t)) return {field: "models.UUIDField()", needsImport: "uuid"};
    if (/^VARCHAR|^CHARACTERVARYING|^CHAR|^NCHAR|^CHARACTER/.test(t)) {
        const m = /\((\d+)\)/.exec(t);
        return {field: `models.CharField(max_length=${m ? m[1] : 255})`, needsImport: null};
    }
    if (/^BOOL|BIT\(1\)/.test(t)) return {field: "models.BooleanField()", needsImport: null};
    // TEXT and everything unknown.
    return {field: "models.TextField()", needsImport: null};
}

/** Generate Django `models.py` from the parsed schema — one model per
 *  table, ForeignKey fields with on_delete, db_table preserved in
 *  Meta, and a string-keyed related-name for reverse access. */
export function djangoModelsFromSchema(tables: SqlTableInfo[]): string {
    if (tables.length === 0) return "# no CREATE TABLE statements found";
    const byName = new Map(tables.map((t) => [t.name.toLowerCase(), t] as const));
    const classOf = new Map(tables.map((t) => [t.name, pascalFromSqlName(t.name)] as const));

    const out: string[] = [];
    out.push(`"""Django models generated from the schema (${new Date().toISOString().slice(0, 10)}).`);
    out.push("");
    out.push("Generated by Praxis from the parsed CREATE TABLE statements —");
    out.push("review field types / nullability against your real DDL before using.");
    out.push('"""');
    const needsTimezone = tables.some((t) => t.columns.some((c) => /^TIMESTAMP|^DATETIME/i.test(c.type)));
    const needsUuid = tables.some((t) => t.columns.some((c) => /^UUID/i.test(c.type)));
    if (needsTimezone) out.push("from django.utils import timezone");
    if (needsUuid) out.push("import uuid");
    out.push("from django.db import models");
    out.push("");
    out.push("");

    // Reverse relations: parent table -> [child attr names] so the
    // ForeignKey gets a related_name (avoids Django clashes).
    const reverse = new Map<string, string[]>();
    for (const child of tables) {
        for (const fk of child.fks ?? []) {
            const parent = byName.get(fk.table.toLowerCase());
            const parentName = parent?.name ?? fk.table;
            if (!reverse.has(parentName)) reverse.set(parentName, []);
            reverse.get(parentName)!.push(`${child.name}s`.replace(/s(s|ch|sh|x|z)$/i, "es").replace(/([^aeiou])y$/i, "$1ies"));
        }
    }

    tables.forEach((t, ti) => {
        const cls = classOf.get(t.name)!;
        out.push(`class ${cls}(models.Model):`);
        for (const col of t.columns) {
            const fk = (t.fks ?? []).find((f) => f.from.toLowerCase() === col.name.toLowerCase());
            if (fk) {
                const parentCls = byName.get(fk.table.toLowerCase()) ? classOf.get(fk.table)! : pascalFromSqlName(fk.table);
                out.push(`    ${snakeFromSqlName(fk.table)} = models.ForeignKey(`);
                out.push(`        "${parentCls}",`);
                out.push(`        on_delete=models.CASCADE,`);
                out.push(`        db_column=${JSON.stringify(col.name)},`);
                out.push(`        related_name=${JSON.stringify(`${snakeFromSqlName(t.name)}_set`)},`);
                out.push(`    )`);
                continue;
            }
            const dt = djangoType(col.type, !!col.pk, null);
            out.push(`    ${snakeFromSqlName(col.name)} = ${dt.field}`);
        }
        out.push("");
        out.push("    class Meta:");
        out.push(`        db_table = ${JSON.stringify(t.name)}`);
        out.push("        managed = False  # the table already exists — migrations won't create it");
        out.push("");
        out.push("    def __str__(self):");
        const first = t.columns[0];
        if (first) {
            out.push(`        return f"${cls}(${snakeFromSqlName(first.name)}={self.${snakeFromSqlName(first.name)}!r})"`);
        } else {
            out.push(`        return ${JSON.stringify(cls)}`);
        }
        out.push("");
        if (ti < tables.length - 1) out.push("");
    });

    return out.join("\n").replace(/\n{3,}/g, "\n\n\n").replace(/\n*$/, "\n");
}

/** SQL column type → Prisma scalar type. */
function prismaType(sqlType: string): string {
    const t = sqlType.toUpperCase().replace(/\s+/g, "");
    if (/^BIGINT|^INT8/.test(t)) return "BigInt";
    if (/^(INT|INTEGER|SMALLINT|MEDIUMINT|SERIAL)/.test(t)) return "Int";
    if (/^BOOLEAN|^BOOL|^BIT\(1\)/.test(t)) return "Boolean";
    if (/^(NUMERIC|DECIMAL)/.test(t)) return "Decimal";
    if (/^REAL|^FLOAT|^DOUBLE/.test(t)) return "Float";
    if (/^TIMESTAMP|^DATETIME/.test(t)) return "DateTime";
    if (/^DATE$/.test(t)) return "DateTime";
    if (/^TIME/.test(t)) return "DateTime";
    if (/^JSON(JSONB)?$/.test(t)) return "Json";
    if (/^BLOB|^BYTEA|^BINARY|^VARBINARY/.test(t)) return "Bytes";
    if (/^UUID/.test(t)) return "String";
    // VARCHAR / CHAR / TEXT and everything unknown.
    return "String";
}

/** Generate a Prisma `schema.prisma` from the parsed schema — models
 *  with @@map to the real table names, @relation pairs for FKs. */
export function prismaSchemaFromSchema(tables: SqlTableInfo[]): string {
    if (tables.length === 0) return "// no CREATE TABLE statements found";
    const byName = new Map(tables.map((t) => [t.name.toLowerCase(), t] as const));
    const modelOf = new Map(tables.map((t) => [t.name, pascalFromSqlName(t.name)] as const));

    // Relation pairs (parent model gets the list side, child keeps the FK).
    interface PPair {
        parent: string;
        child: string;
        fk: SqlForeignKey;
        listAttr: string
    }

    const pairs: PPair[] = [];
    const taken = new Map<string, Set<string>>();
    for (const t of tables) taken.set(t.name, new Set(t.columns.map((c) => snakeFromSqlName(c.name))));
    for (const child of tables) {
        for (const fk of child.fks ?? []) {
            const parent = byName.get(fk.table.toLowerCase());
            const parentName = parent?.name ?? fk.table;
            const base = snakeFromSqlName(child.name);
            const listAttr = dedupe(/(s|ch|sh|x|z)$/.test(base) ? base : `${base}s`, taken.get(parentName)!);
            pairs.push({parent: parentName, child: child.name, fk, listAttr});
        }
    }

    const out: string[] = [];
    out.push(`// Prisma schema generated from the SQL DDL (${new Date().toISOString().slice(0, 10)}).`);
    out.push("// Generated by Praxis — review nullability / defaults against your real DDL.");
    out.push("");
    out.push("generator client {");
    out.push('  provider = "prisma-client-js"');
    out.push("}");
    out.push("");
    out.push('datasource db {');
    out.push('  provider = "postgresql" // adjust to match the real engine');
    out.push('  url      = env("DATABASE_URL")');
    out.push("}");
    out.push("");

    tables.forEach((t) => {
        const model = modelOf.get(t.name)!;
        out.push(`model ${model} {`);
        for (const col of t.columns) {
            const attr = snakeFromSqlName(col.name);
            const fk = (t.fks ?? []).find((f) => f.from.toLowerCase() === col.name.toLowerCase());
            if (fk) {
                // The FK column itself — the Prisma relation field is added
                // below, pointing at this attribute.
                out.push(`  ${attr} ${prismaType(col.type)} @map(${JSON.stringify(col.name)})`);
                continue;
            }
            const parts: string[] = [];
            if (col.pk) parts.push("@id");
            if (col.name !== attr) parts.push(`@map(${JSON.stringify(col.name)})`);
            out.push(`  ${attr} ${prismaType(col.type)}${parts.length ? " " + parts.join(" ") : ""}`);
        }
        // relation fields + reverse list side
        for (const p of pairs.filter((x) => x.child === t.name)) {
            const parentModel = byName.get(p.fk.table.toLowerCase()) ? modelOf.get(p.fk.table)! : pascalFromSqlName(p.fk.table);
            out.push(`  ${snakeFromSqlName(p.fk.table)} ${parentModel} @relation(fields: [${snakeFromSqlName(p.fk.from)}], references: [${snakeFromSqlName(p.fk.to)}])`);
        }
        for (const p of pairs.filter((x) => x.parent === t.name)) {
            out.push(`  ${p.listAttr} ${modelOf.get(p.child)!}[]`);
        }
        const maps = t.columns.filter((c) => snakeFromSqlName(c.name) !== c.name);
        if (t.name !== snakeFromSqlName(t.name)) out.push(`  @@map(${JSON.stringify(t.name)})`);
        else if (maps.length > 0) out.push(`  @@map(${JSON.stringify(t.name)})`);
        out.push("}");
        out.push("");
    });

    return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
}
