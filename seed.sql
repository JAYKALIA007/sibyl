-- Sibyl seed database — a realistic 16-table e-commerce schema.
-- Designed to stress every SQL pattern: self-referential joins (categories),
-- junction tables (product_tags), NULLs (coupons, shipments, returns),
-- multi-level aggregation, and 4-way joins.
-- Run as owner/superuser. See SETUP.md.

-- ── drop in reverse FK order ─────────────────────────────────────────────────
DROP TABLE IF EXISTS wishlists;
DROP TABLE IF EXISTS returns;
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS coupons;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS product_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS addresses;
DROP TABLE IF EXISTS users;

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id         serial PRIMARY KEY,
  name       text        NOT NULL,
  email      text UNIQUE NOT NULL,
  country    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── addresses ─────────────────────────────────────────────────────────────────
CREATE TABLE addresses (
  id         serial PRIMARY KEY,
  user_id    int  NOT NULL REFERENCES users(id),
  street     text NOT NULL,
  city       text NOT NULL,
  country    text NOT NULL,
  is_default boolean NOT NULL DEFAULT false
);

-- ── suppliers ────────────────────────────────────────────────────────────────
CREATE TABLE suppliers (
  id      serial PRIMARY KEY,
  name    text NOT NULL,
  country text NOT NULL,
  email   text NOT NULL
);

-- ── categories (self-referential: parent_id for subcategories) ────────────────
CREATE TABLE categories (
  id        serial PRIMARY KEY,
  name      text NOT NULL,
  parent_id int  REFERENCES categories(id)   -- NULL = top-level
);

-- ── products ─────────────────────────────────────────────────────────────────
CREATE TABLE products (
  id          serial PRIMARY KEY,
  name        text           NOT NULL,
  category_id int            NOT NULL REFERENCES categories(id),
  supplier_id int            NOT NULL REFERENCES suppliers(id),
  price       numeric(10, 2) NOT NULL
);

-- ── inventory ────────────────────────────────────────────────────────────────
CREATE TABLE inventory (
  product_id        int NOT NULL PRIMARY KEY REFERENCES products(id),
  stock_qty         int NOT NULL DEFAULT 0,
  reorder_threshold int NOT NULL DEFAULT 10
);

-- ── tags + product_tags (many-to-many) ───────────────────────────────────────
CREATE TABLE tags (
  id   serial PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE product_tags (
  product_id int NOT NULL REFERENCES products(id),
  tag_id     int NOT NULL REFERENCES tags(id),
  PRIMARY KEY (product_id, tag_id)
);

-- ── coupons ──────────────────────────────────────────────────────────────────
CREATE TABLE coupons (
  id           serial PRIMARY KEY,
  code         text           NOT NULL UNIQUE,
  discount_pct numeric(5, 2)  NOT NULL,
  expires_at   timestamptz    NOT NULL,
  max_uses     int            NOT NULL,
  used_count   int            NOT NULL DEFAULT 0
);

-- ── orders ───────────────────────────────────────────────────────────────────
CREATE TABLE orders (
  id         serial PRIMARY KEY,
  user_id    int  NOT NULL REFERENCES users(id),
  address_id int  NOT NULL REFERENCES addresses(id),
  coupon_id  int  REFERENCES coupons(id),          -- NULL = no coupon
  status     text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── order_items ──────────────────────────────────────────────────────────────
CREATE TABLE order_items (
  id         serial PRIMARY KEY,
  order_id   int            NOT NULL REFERENCES orders(id),
  product_id int            NOT NULL REFERENCES products(id),
  quantity   int            NOT NULL DEFAULT 1,
  unit_price numeric(10, 2) NOT NULL               -- price at time of purchase
);

-- ── payments ─────────────────────────────────────────────────────────────────
CREATE TABLE payments (
  id      serial PRIMARY KEY,
  order_id int            NOT NULL REFERENCES orders(id),
  amount  numeric(10, 2)  NOT NULL,
  method  text            NOT NULL,                -- 'card', 'paypal', 'upi'
  status  text            NOT NULL DEFAULT 'pending',
  paid_at timestamptz                              -- NULL until payment clears
);

-- ── shipments ────────────────────────────────────────────────────────────────
CREATE TABLE shipments (
  id              serial PRIMARY KEY,
  order_id        int  NOT NULL REFERENCES orders(id),
  carrier         text NOT NULL,
  tracking_number text,                            -- NULL until label created
  shipped_at      timestamptz,                     -- NULL until picked up
  delivered_at    timestamptz                      -- NULL until delivered
);

-- ── returns ──────────────────────────────────────────────────────────────────
CREATE TABLE returns (
  id            serial PRIMARY KEY,
  order_item_id int  NOT NULL REFERENCES order_items(id),
  reason        text NOT NULL,
  status        text NOT NULL DEFAULT 'requested', -- requested/approved/rejected
  requested_at  timestamptz NOT NULL DEFAULT now()
);

-- ── reviews ──────────────────────────────────────────────────────────────────
CREATE TABLE reviews (
  id         serial PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id),
  product_id int NOT NULL REFERENCES products(id),
  rating     int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       text,                                 -- NULL = rating-only
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── wishlists ────────────────────────────────────────────────────────────────
CREATE TABLE wishlists (
  id         serial PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id),
  product_id int NOT NULL REFERENCES products(id),
  added_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

-- ══════════════════════════════════════════════════════════════════════════════
-- DATA
-- ══════════════════════════════════════════════════════════════════════════════

-- ── users (10) ───────────────────────────────────────────────────────────────
INSERT INTO users (name, email, country) VALUES
  ('Alice Johnson',  'alice@example.com',   'USA'),
  ('Bob Smith',      'bob@example.com',     'USA'),
  ('Carla Diaz',     'carla@example.com',   'Mexico'),
  ('Deepak Rao',     'deepak@example.com',  'India'),
  ('Elena Petrova',  'elena@example.com',   'Germany'),
  ('Fatima Al-Said', 'fatima@example.com',  'UAE'),
  ('George Tanaka',  'george@example.com',  'Japan'),
  ('Hannah Lee',     'hannah@example.com',  'South Korea'),
  ('Ivan Novak',     'ivan@example.com',    'Czech Republic'),
  ('Julia Souza',    'julia@example.com',   'Brazil');

-- ── addresses (12) ───────────────────────────────────────────────────────────
INSERT INTO addresses (user_id, street, city, country, is_default) VALUES
  (1,  '123 Maple St',      'New York',    'USA',            true),
  (1,  '456 Oak Ave',       'Los Angeles', 'USA',            false),
  (2,  '789 Pine Rd',       'Chicago',     'USA',            true),
  (3,  '10 Calle Luna',     'Mexico City', 'Mexico',         true),
  (4,  '22 MG Road',        'Bangalore',   'India',          true),
  (5,  '5 Berliner Str',    'Berlin',      'Germany',        true),
  (6,  '7 Sheikh Zayed Rd', 'Dubai',       'UAE',            true),
  (7,  '3-1 Shibuya',       'Tokyo',       'Japan',          true),
  (8,  '88 Gangnam-daero',  'Seoul',       'South Korea',    true),
  (9,  '14 Wenceslas Sq',   'Prague',      'Czech Republic', true),
  (10, '99 Av Paulista',    'São Paulo',   'Brazil',         true),
  (2,  '321 Elm St',        'Houston',     'USA',            false);

-- ── suppliers (4) ────────────────────────────────────────────────────────────
INSERT INTO suppliers (name, country, email) VALUES
  ('TechParts Co',    'USA',   'orders@techparts.com'),
  ('HomeGoods Ltd',   'China', 'supply@homegoods.cn'),
  ('PaperWorld Inc',  'India', 'b2b@paperworld.in'),
  ('AccessoryHub',    'Japan', 'wholesale@accessoryhub.jp');

-- ── categories (5, with 2 subcategories) ─────────────────────────────────────
INSERT INTO categories (name, parent_id) VALUES
  ('Electronics',   NULL),   -- 1
  ('Accessories',   1),      -- 2  (sub of Electronics)
  ('Home & Office', NULL),   -- 3
  ('Furniture',     3),      -- 4  (sub of Home & Office)
  ('Stationery',    NULL);   -- 5

-- ── products (15) ────────────────────────────────────────────────────────────
INSERT INTO products (name, category_id, supplier_id, price) VALUES
  ('Wireless Mouse',         2, 1,  24.99),   -- 1
  ('Mechanical Keyboard',    1, 1,  89.50),   -- 2
  ('Coffee Mug',             3, 2,  12.00),   -- 3
  ('Desk Lamp',              4, 2,  34.75),   -- 4
  ('Notebook',               5, 3,   4.50),   -- 5
  ('USB-C Cable',            2, 1,   9.99),   -- 6
  ('Standing Desk Mat',      3, 2,  49.00),   -- 7
  ('Webcam HD',              1, 1,  79.99),   -- 8
  ('Sticky Notes Pack',      5, 3,   3.25),   -- 9
  ('Monitor Stand',          4, 2,  59.95),   -- 10
  ('Laptop Sleeve',          2, 4,  29.99),   -- 11
  ('Blue Light Glasses',     2, 4,  19.99),   -- 12
  ('Whiteboard',             3, 3,  74.00),   -- 13
  ('Ergonomic Chair Cushion',4, 2,  44.50),   -- 14
  ('Fountain Pen',           5, 3,  34.00);   -- 15

-- ── inventory ────────────────────────────────────────────────────────────────
INSERT INTO inventory (product_id, stock_qty, reorder_threshold) VALUES
  (1,  142, 20), (2,  38,  10), (3,  210, 30),
  (4,  55,  15), (5,  500, 50), (6,  320, 40),
  (7,  27,  10), (8,  19,  10), (9,  800, 100),
  (10, 41,  10), (11, 63,  20), (12, 88,  20),
  (13, 12,  5),  (14, 34,  10), (15, 76,  15);

-- ── tags ─────────────────────────────────────────────────────────────────────
INSERT INTO tags (name) VALUES
  ('work-from-home'),  -- 1
  ('bestseller'),      -- 2
  ('eco-friendly'),    -- 3
  ('budget-friendly'), -- 4
  ('premium'),         -- 5
  ('new-arrival');     -- 6

-- ── product_tags ─────────────────────────────────────────────────────────────
INSERT INTO product_tags (product_id, tag_id) VALUES
  (1,1),(1,2),         -- Mouse: work-from-home, bestseller
  (2,1),(2,2),(2,5),   -- Keyboard: work-from-home, bestseller, premium
  (3,3),(3,4),         -- Coffee Mug: eco-friendly, budget-friendly
  (4,1),               -- Desk Lamp: work-from-home
  (5,3),(5,4),         -- Notebook: eco-friendly, budget-friendly
  (6,2),(6,4),         -- USB-C Cable: bestseller, budget-friendly
  (7,1),(7,6),         -- Desk Mat: work-from-home, new-arrival
  (8,1),(8,5),         -- Webcam: work-from-home, premium
  (9,4),               -- Sticky Notes: budget-friendly
  (10,1),(10,5),       -- Monitor Stand: work-from-home, premium
  (11,6),              -- Laptop Sleeve: new-arrival
  (12,1),(12,6),       -- Blue Light Glasses: work-from-home, new-arrival
  (13,1),              -- Whiteboard: work-from-home
  (14,1),(14,6),       -- Chair Cushion: work-from-home, new-arrival
  (15,5),(15,3);       -- Fountain Pen: premium, eco-friendly

-- ── coupons (5: 3 active, 2 expired) ─────────────────────────────────────────
INSERT INTO coupons (code, discount_pct, expires_at, max_uses, used_count) VALUES
  ('SAVE10',   10.00, now() + interval '6 months',  100,  23),
  ('WELCOME20',20.00, now() - interval '30 days',    50,  49),  -- expired
  ('FLASH15',  15.00, now() + interval '2 months',   20,   7),
  ('VIP25',    25.00, now() + interval '1 year',     10,   3),
  ('BUDGET5',   5.00, now() - interval '10 days',   200, 198);  -- expired

-- ── orders (20) ──────────────────────────────────────────────────────────────
INSERT INTO orders (user_id, address_id, coupon_id, status) VALUES
  (1,  1,  1, 'completed'),  -- 1  Alice, SAVE10
  (1,  1,  NULL, 'completed'), -- 2  Alice, no coupon
  (1,  2,  NULL, 'pending'),   -- 3  Alice, alt address
  (2,  3,  3, 'completed'),  -- 4  Bob, FLASH15
  (2,  3,  NULL, 'cancelled'), -- 5  Bob, no coupon
  (3,  4,  NULL, 'completed'), -- 6  Carla
  (3,  4,  NULL, 'pending'),   -- 7  Carla
  (4,  5,  4, 'completed'),  -- 8  Deepak, VIP25
  (4,  5,  NULL, 'cancelled'), -- 9  Deepak
  (5,  6,  NULL, 'completed'), -- 10 Elena
  (5,  6,  1, 'completed'),  -- 11 Elena, SAVE10
  (6,  7,  NULL, 'completed'), -- 12 Fatima
  (6,  7,  NULL, 'pending'),   -- 13 Fatima
  (7,  8,  NULL, 'completed'), -- 14 George
  (7,  8,  3, 'completed'),  -- 15 George, FLASH15
  (8,  9,  NULL, 'completed'), -- 16 Hannah
  (8,  9,  NULL, 'pending'),   -- 17 Hannah
  (9,  10, NULL, 'completed'), -- 18 Ivan
  (10, 11, 4, 'completed'),  -- 19 Julia, VIP25
  (2,  12, NULL, 'completed'); -- 20 Bob, alt address

-- ── order_items (35) ─────────────────────────────────────────────────────────
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
  -- order 1 (Alice, completed)
  (1,  1,  2, 24.99), (1,  3,  1, 12.00),
  -- order 2 (Alice, completed)
  (2,  6,  1,  9.99), (2,  8,  1, 79.99),
  -- order 3 (Alice, pending)
  (3,  10, 1, 59.95),
  -- order 4 (Bob, completed)
  (4,  2,  1, 89.50), (4,  6,  3,  9.99),
  -- order 5 (Bob, cancelled)
  (5,  9,  2,  3.25),
  -- order 6 (Carla, completed)
  (6,  4,  1, 34.75), (6,  5,  5,  4.50), (6,  3,  2, 12.00),
  -- order 7 (Carla, pending)
  (7,  11, 1, 29.99),
  -- order 8 (Deepak, completed)
  (8,  2,  1, 89.50), (8,  8,  1, 79.99), (8,  10, 2, 59.95),
  -- order 9 (Deepak, cancelled)
  (9,  1,  1, 24.99),
  -- order 10 (Elena, completed)
  (10, 3,  2, 12.00), (10, 7,  1, 49.00),
  -- order 11 (Elena, completed)
  (11, 5,  3,  4.50), (11, 15, 1, 34.00),
  -- order 12 (Fatima, completed)
  (12, 1,  1, 24.99), (12, 4,  1, 34.75),
  -- order 13 (Fatima, pending)
  (13, 6,  2,  9.99),
  -- order 14 (George, completed)
  (14, 2,  1, 89.50), (14, 9,  5,  3.25),
  -- order 15 (George, completed)
  (15, 8,  1, 79.99), (15, 12, 1, 19.99),
  -- order 16 (Hannah, completed)
  (16, 3,  1, 12.00), (16, 5,  2,  4.50),
  -- order 17 (Hannah, pending)
  (17, 10, 1, 59.95),
  -- order 18 (Ivan, completed)
  (18, 1,  1, 24.99), (18, 6,  1,  9.99),
  -- order 19 (Julia, completed)
  (19, 4,  1, 34.75), (19, 13, 1, 74.00),
  -- order 20 (Bob, completed)
  (20, 7,  1, 49.00), (20, 14, 1, 44.50);

-- ── payments (17: completed orders have payment; pending/cancelled don't) ─────
INSERT INTO payments (order_id, amount, method, status, paid_at) VALUES
  (1,  61.97, 'card',   'paid', now() - interval '10 days'),
  (2,  89.98, 'paypal', 'paid', now() - interval '9 days'),
  (4,  119.47,'card',   'paid', now() - interval '12 days'),
  (6,  81.25, 'card',   'paid', now() - interval '3 days'),
  (8,  289.39,'upi',    'paid', now() - interval '15 days'),
  (10, 73.00, 'card',   'paid', now() - interval '20 days'),
  (11, 47.50, 'paypal', 'paid', now() - interval '18 days'),
  (12, 59.74, 'card',   'paid', now() - interval '8 days'),
  (14, 105.75,'card',   'paid', now() - interval '30 days'),
  (15, 99.98, 'paypal', 'paid', now() - interval '28 days'),
  (16, 21.00, 'card',   'paid', now() - interval '5 days'),
  (18, 34.98, 'card',   'paid', now() - interval '3 days'),
  (19, 108.75,'upi',    'paid', now() - interval '1 day'),
  (20, 93.50, 'card',   'paid', now() - interval '6 days'),
  -- pending payment (order placed but not yet paid)
  (3,  59.95, 'card',   'pending', NULL),
  (7,  29.99, 'card',   'pending', NULL),
  (17, 59.95, 'paypal', 'pending', NULL);

-- ── shipments (12: only completed orders) ────────────────────────────────────
INSERT INTO shipments (order_id, carrier, tracking_number, shipped_at, delivered_at) VALUES
  (1,  'FedEx', 'FX123001', now() - interval '9 days',  now() - interval '7 days'),
  (2,  'UPS',   'UPS200002',now() - interval '8 days',  now() - interval '6 days'),
  (4,  'FedEx', 'FX123004', now() - interval '11 days', now() - interval '9 days'),
  (6,  'DHL',   'DHL30006', now() - interval '2 days',  NULL),               -- in transit
  (8,  'Blue',  'BDA40008', now() - interval '14 days', now() - interval '12 days'),
  (10, 'DHL',   'DHL30010', now() - interval '18 days', now() - interval '16 days'),
  (11, 'FedEx', 'FX123011', now() - interval '17 days', now() - interval '15 days'),
  (12, 'UPS',   NULL,        NULL,                       NULL),               -- label not created yet
  (14, 'FedEx', 'FX123014', now() - interval '29 days', now() - interval '27 days'),
  (15, 'DHL',   'DHL30015', now() - interval '27 days', now() - interval '25 days'),
  (16, 'UPS',   'UPS200016',now() - interval '4 days',  now() - interval '2 days'),
  (18, 'Blue',  'BDA40018', now() - interval '2 days',  NULL);               -- in transit

-- ── returns (5) ──────────────────────────────────────────────────────────────
INSERT INTO returns (order_item_id, reason, status) VALUES
  (7,  'Item arrived damaged',      'approved'),
  (16, 'Wrong size',                'approved'),
  (2,  'Changed my mind',           'rejected'),
  (23, 'Defective — screen flicker','approved'),
  (31, 'Not as described',          'requested');

-- ── reviews (20) ─────────────────────────────────────────────────────────────
INSERT INTO reviews (user_id, product_id, rating, body) VALUES
  (1,  1,  5, 'Great mouse, very responsive.'),
  (1,  3,  4, 'Nice mug, keeps coffee hot.'),
  (2,  2,  5, 'Best keyboard I have ever used.'),
  (2,  6,  3, NULL),
  (3,  4,  2, 'Lamp flickered after a week.'),
  (3,  3,  5, 'Perfect size for my desk.'),
  (4,  2,  4, 'Solid build, a bit loud.'),
  (4,  8,  5, 'Crystal clear image, easy setup.'),
  (5,  3,  4, NULL),
  (5,  7,  5, 'Best purchase this year.'),
  (6,  1,  4, 'Good value for the price.'),
  (6,  4,  3, 'Decent lamp but flickered once.'),
  (7,  2,  5, 'Mechanical keyboards are life.'),
  (7,  8,  4, 'Good webcam, slight lag on calls.'),
  (8,  3,  5, NULL),
  (8,  5,  1, 'Fell apart after a week.'),
  (9,  1,  4, 'Comfortable grip, good battery.'),
  (10, 4,  4, 'Looks great on the desk.'),
  (5,  15, 5, 'Writes beautifully, feels premium.'),
  (1,  8,  5, 'Sharp image, plug-and-play.');

-- ── wishlists (12) ───────────────────────────────────────────────────────────
INSERT INTO wishlists (user_id, product_id) VALUES
  (1,  13), (1,  14),
  (2,  10), (2,  12),
  (3,  8),
  (4,  7),  (4,  11),
  (5,  2),
  (6,  8),  (6,  15),
  (7,  14),
  (9,  13);

-- ── RLS (Supabase) ────────────────────────────────────────────────────────────
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS sibyl_read ON %I', t);
    EXECUTE format('CREATE POLICY sibyl_read ON %I FOR SELECT USING (true)', t);
  END LOOP;
END $$;
