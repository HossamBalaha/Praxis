-- BigSchema — 16 tables, 15+ foreign keys.
-- A playground for the schema diagram, Relations, Keys &
-- columns and the SQLAlchemy / Django / Prisma generators.

CREATE TABLE customers
(
    id         INTEGER PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    email      VARCHAR(255),
    tier       VARCHAR(20),
    created_at TIMESTAMP
);

CREATE TABLE addresses
(
    id          INTEGER PRIMARY KEY,
    customer_id INTEGER REFERENCES customers (id),
    street      VARCHAR(200),
    city        VARCHAR(80),
    country     VARCHAR(60),
    postal      VARCHAR(16)
);

CREATE TABLE staff
(
    id       INTEGER PRIMARY KEY,
    name     VARCHAR(120),
    role     VARCHAR(40),
    hired_on DATE
);

CREATE TABLE warehouses
(
    id         INTEGER PRIMARY KEY,
    code       VARCHAR(12),
    manager_id INTEGER REFERENCES staff (id),
    zone       VARCHAR(30)
);

CREATE TABLE suppliers
(
    id        INTEGER PRIMARY KEY,
    name      VARCHAR(140),
    lead_days INTEGER,
    rating    NUMERIC(3, 2)
);

CREATE TABLE product_lines
(
    id    INTEGER PRIMARY KEY,
    title VARCHAR(90),
    notes TEXT
);

CREATE TABLE products
(
    id           INTEGER PRIMARY KEY,
    sku          VARCHAR(24),
    line_id      INTEGER REFERENCES product_lines (id),
    supplier_id  INTEGER REFERENCES suppliers (id),
    name         VARCHAR(160),
    unit_price   NUMERIC(10, 2),
    mass_kg      NUMERIC(8, 3),
    discontinued BOOLEAN
);

CREATE TABLE inventory
(
    id           INTEGER PRIMARY KEY,
    product_id   INTEGER REFERENCES products (id),
    warehouse_id INTEGER REFERENCES warehouses (id),
    on_hand      INTEGER,
    reserved     INTEGER
);

CREATE TABLE orders
(
    id          INTEGER PRIMARY KEY,
    customer_id INTEGER REFERENCES customers (id),
    address_id  INTEGER REFERENCES addresses (id),
    staff_id    INTEGER REFERENCES staff (id),
    placed_at   TIMESTAMP,
    status      VARCHAR(24)
);

CREATE TABLE order_items
(
    id         INTEGER PRIMARY KEY,
    order_id   INTEGER REFERENCES orders (id),
    product_id INTEGER REFERENCES products (id),
    quantity   INTEGER,
    unit_price NUMERIC(10, 2)
);

CREATE TABLE shipments
(
    id           INTEGER PRIMARY KEY,
    order_id     INTEGER REFERENCES orders (id),
    warehouse_id INTEGER REFERENCES warehouses (id),
    shipped_at   TIMESTAMP,
    carrier      VARCHAR(60),
    tracking     VARCHAR(40)
);

CREATE TABLE payment_methods
(
    id          INTEGER PRIMARY KEY,
    customer_id INTEGER REFERENCES customers (id),
    kind        VARCHAR(20),
    last_four   VARCHAR(4),
    expiry      DATE
);

CREATE TABLE payments
(
    id        INTEGER PRIMARY KEY,
    order_id  INTEGER REFERENCES orders (id),
    method_id INTEGER REFERENCES payment_methods (id),
    amount    NUMERIC(10, 2),
    paid_at   TIMESTAMP
);

CREATE TABLE returns
(
    id            INTEGER PRIMARY KEY,
    order_item_id INTEGER REFERENCES order_items (id),
    reason        TEXT,
    refund        NUMERIC(10, 2)
);

CREATE TABLE reviews
(
    id          INTEGER PRIMARY KEY,
    product_id  INTEGER REFERENCES products (id),
    customer_id INTEGER REFERENCES customers (id),
    stars       INTEGER,
    body        TEXT
);

CREATE TABLE audit_log
(
    id        INTEGER PRIMARY KEY,
    actor_id  INTEGER REFERENCES staff (id),
    entity    VARCHAR(40),
    entity_id INTEGER,
    change    TEXT,
    at        TIMESTAMP
);
