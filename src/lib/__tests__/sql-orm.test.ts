import {describe, expect, it} from "vitest";
import {parseSqlSchema} from "../sql-schema-parser";
import {
    djangoModelsFromSchema,
    prismaSchemaFromSchema,
    relationsReportFromSchema,
    sqlalchemyModelsFromSchema,
} from "../sql-orm";

const DDL = `
CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255)
);
CREATE TABLE publishers (
  id INTEGER PRIMARY KEY,
  brand VARCHAR(80) NOT NULL
);
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  author_id INTEGER REFERENCES authors(id),
  publisher_id INTEGER REFERENCES publishers(id),
  published DATE
);
`;

const schema = parseSqlSchema(DDL);

describe("sql-orm — SQLAlchemy", () => {
    it("generates classes, ForeignKey columns and paired relationships", () => {
        const code = sqlalchemyModelsFromSchema(schema.tables);
        expect(code).toContain("class Authors(Base):");
        expect(code).toContain('__tablename__ = "authors"');
        expect(code).toContain('ForeignKey("authors.id")');
        expect(code).toContain("relationship(back_populates=");
        // the parser keeps type modifiers now.
        expect(code).toContain("String(120)");
    });
});

describe("sql-orm — Django", () => {
    it("generates models with ForeignKey, db_column and Meta.db_table", () => {
        const code = djangoModelsFromSchema(schema.tables);
        expect(code).toContain("from django.db import models");
        expect(code).toContain("class Books(models.Model):");
        expect(code).toContain('"Authors"');
        expect(code).toContain("on_delete=models.CASCADE");
        expect(code).toContain('db_column="author_id"');
        expect(code).toContain('db_table = "books"');
        // VARCHAR(120) survives into max_length.
        expect(code).toContain("max_length=120");
    });
});

describe("sql-orm — Prisma models", () => {
    it("generates models with @@map and @relation pairs", () => {
        const code = prismaSchemaFromSchema(schema.tables);
        expect(code).toContain("model Books {");
        expect(code).toContain("@relation(fields: [author_id], references: [id])");
        expect(code).toContain("books Books[]");
        expect(code).toContain('provider = "prisma-client-js"');
    });
});

describe("sql-orm — relations report", () => {
    it("lists every FK edge and the total", () => {
        const report = relationsReportFromSchema(schema.tables);
        expect(report).toContain("2 relations across 1 table");
        expect(report).toContain("books.author_id  →  authors.id");
    });
});

describe("sql-orm — empty schema", () => {
    it("never crashes on no tables", () => {
        expect(sqlalchemyModelsFromSchema([])).toContain("no CREATE TABLE");
        expect(djangoModelsFromSchema([])).toContain("no CREATE TABLE");
        expect(prismaSchemaFromSchema([])).toContain("no CREATE TABLE");
    });
});
