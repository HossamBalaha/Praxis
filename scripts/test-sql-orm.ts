import {parseSqlSchema} from "../src/lib/sql-schema-parser";
import {relationsReportFromSchema, sqlalchemyModelsFromSchema} from "../src/lib/sql-orm";

const ddl = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(120),
  created_at DATETIME
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  total NUMERIC(10,2),
  note TEXT,
  placed TIMESTAMP
);
CREATE TABLE order_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
`;

const schema3 = `CREATE TABLE "authors" (id SERIAL0" PRIMARY KEY, name TEXT);
CREATE TABLE books (id INTEGER PRIMARY KEY, author_id INTEGER NOT NULL, title VARCHAR(200), published DATE,
  CONSTRAINT fk_author FOREIGN KEY (author_id) REFERENCES authors(id));
CREATE TABLE reviews (book_id INTEGER REFERENCES books(id), stars SMALLINT CHECK(stars>0));`;

const schema = parseSqlSchema(ddl.replace("CREATE TABLE orders (", "CREATE TABLE orders_2 (").replace(/order_at DATETIME,/, ""));
console.log("=== orders schema (fixed ddl) ===");
const fixed = `
CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(80) NOT NULL, email VARCHAR(120), created_at DATETIME);
CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), total NUMERIC(10,2), note TEXT, placed TIMESTAMP);
`;
const parsed = parseSqlSchema(fixed);
console.log(relationsReportFromSchema(parsed.tables));
console.log(sqlalchemyModelsFromSchema(parsed.tables));
console.log("=== second schema ===");
const p2 = parseSqlSchema(schema3);
console.log(relationsReportFromSchema(p2.tables));
console.log(sqlalchemyModelsFromSchema(p2.tables));
