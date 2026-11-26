import {describe, expect, it} from "vitest";
import {parseSqlSchema, splitTopLevel, stripSqlComments, unquoteIdent} from "../sql-schema-parser";

const DDL = `
-- Users & orders ( fixture)
CREATE TABLE IF NOT EXISTS "users" (
  id INTEGER PRIMARY KEY,
  "full name" VARCHAR(80) NOT NULL,
  email TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE orders (
  order_id INTEGER,
  user_id INTEGER REFERENCES users(id),
  total NUMERIC(10, 2),
  PRIMARY KEY (order_id),
  FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT positive_total CHECK (total >= 0)
);
CREATE TABLE "order items" (
  order_ref INTEGER NOT NULL,
  product TEXT,
  qty INT DEFAULT 1,
  FOREIGN KEY (order_ref) REFERENCES orders (order_id)
);
CREATE VIEW v_totals AS SELECT 1; /* ignored */
CREATE INDEX idx_orders_user ON orders (user_id);
`;

describe("stripSqlComments", () => {
    it("removes line and block comments but keeps strings", () => {
        const out = stripSqlComments("a -- hidden\nb /* gone */ c 'keep -- me' d");
        expect(out).toBe("a \nb  c 'keep -- me' d");
    });
});

describe("unquoteIdent", () => {
    it("unquotes and drops schema prefixes", () => {
        expect(unquoteIdent('"users"')).toBe("users");
        expect(unquoteIdent("`order items`")).toBe("order items");
        expect(unquoteIdent("[brackets]")).toBe("brackets");
        expect(unquoteIdent("dbo.Users")).toBe("Users");
        expect(unquoteIdent("plain")).toBe("plain");
    });
});

describe("splitTopLevel", () => {
    it("splits only on depth-0 commas", () => {
        expect(splitTopLevel("a INT, b NUMERIC(10, 2), CHECK(x IN (1, 2))")).toHaveLength(3);
    });
});

describe("parseSqlSchema", () => {
    const schema = parseSqlSchema(DDL);

    it("finds all three tables with quoted names", () => {
        expect(schema.tables.map((t) => t.name)).toEqual(["users", "orders", "order items"]);
    });

    it("marks PRIMARY KEY columns (inline + table-level)", () => {
        const users = schema.tables[0];
        expect(users.columns.find((c) => c.name === "id")?.pk).toBe(true);
        expect(users.columns.find((c) => c.name === "email")?.pk).toBeFalsy();
        const orders = schema.tables[1];
        expect(orders.columns.find((c) => c.name === "order_id")?.pk).toBe(true);
        expect(orders.columns.find((c) => c.name === "user_id")?.pk).toBeFalsy();
    });

    it("parses inline REFERENCES and table-level FOREIGN KEY edges", () => {
        const orders = schema.tables[1];
        const edges = orders.fks.map((f) => `${f.from}→${f.table}.${f.to}`);
        // inline REFERENCES + table-level FOREIGN KEY describe the SAME
        // relation — the parser dedupes them into one diagram edge.
        expect(edges).toEqual(["user_id→users.id"]);
        const items = schema.tables[2];
        expect(items.fks).toEqual([{from: "order_ref", table: "orders", to: "order_id"}]);
    });

    it("keeps CHECK/DEFAULT bodies from breaking the column list", () => {
        const orders = schema.tables[1];
        expect(orders.columns.map((c) => c.name)).toEqual(["order_id", "user_id", "total"]);
        // the parser keeps type modifiers now — NUMERIC(10,2).
        expect(orders.columns.find((c) => c.name === "total")?.type).toBe("NUMERIC(10,2)");
    });

    it("records views/indexes as skipped, not tables", () => {
        expect(schema.skipped).toEqual(["VIEW v_totals", "INDEX idx_orders_user"]);
    });

    it("returns an empty schema for non-DDL SQL", () => {
        const s = parseSqlSchema("SELECT 1 + 2;\nINSERT INTO t VALUES (1);");
        expect(s.tables).toEqual([]);
        expect(s.skipped).toEqual([]);
    });
});
