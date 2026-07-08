-- Sibyl seed database — e-commerce schema (users · products · orders · reviews).
-- Run as a superuser/owner (not sibyl_ro). See SETUP.md.
-- Designed to stress-test: aggregation, multi-table JOINs, NULLs, GROUP BY ties.

DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;

-- ── tables ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id         serial PRIMARY KEY,
  name       text        NOT NULL,
  email      text UNIQUE NOT NULL,
  country    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id       serial PRIMARY KEY,
  name     text           NOT NULL,
  category text           NOT NULL,
  price    numeric(10, 2) NOT NULL
);

CREATE TABLE orders (
  id          serial PRIMARY KEY,
  user_id     int         NOT NULL REFERENCES users(id),
  product_id  int         NOT NULL REFERENCES products(id),
  quantity    int         NOT NULL DEFAULT 1,
  status      text        NOT NULL DEFAULT 'completed',
  shipped_at  timestamptz,           -- NULL = not yet shipped
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id         serial PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id),
  product_id int NOT NULL REFERENCES products(id),
  rating     int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       text,                   -- NULL = rating-only review
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── users (10) ────────────────────────────────────────────────────────────────

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

-- ── products (10) ─────────────────────────────────────────────────────────────

INSERT INTO products (name, category, price) VALUES
  ('Wireless Mouse',      'Electronics',  24.99),
  ('Mechanical Keyboard', 'Electronics',  89.50),
  ('Coffee Mug',          'Home',         12.00),
  ('Desk Lamp',           'Home',         34.75),
  ('Notebook',            'Stationery',    4.50),
  ('USB-C Cable',         'Electronics',   9.99),
  ('Standing Desk Mat',   'Home',         49.00),
  ('Webcam HD',           'Electronics',  79.99),
  ('Sticky Notes Pack',   'Stationery',    3.25),
  ('Monitor Stand',       'Electronics',  59.95);

-- ── orders (32) — mix of statuses, some shipped, some not ────────────────────

INSERT INTO orders (user_id, product_id, quantity, status, shipped_at) VALUES
  -- Alice
  (1,  1, 2, 'completed', now() - interval '10 days'),
  (1,  3, 1, 'completed', now() - interval '9 days'),
  (1,  6, 1, 'completed', now() - interval '8 days'),
  (1,  8, 1, 'completed', now() - interval '5 days'),
  (1, 10, 1, 'pending',   NULL),
  -- Bob
  (2,  2, 1, 'completed', now() - interval '12 days'),
  (2,  6, 3, 'completed', now() - interval '11 days'),
  (2,  7, 1, 'completed', now() - interval '7 days'),
  (2,  9, 2, 'cancelled', NULL),
  -- Carla
  (3,  4, 1, 'pending',   NULL),
  (3,  5, 5, 'completed', now() - interval '3 days'),
  (3,  3, 2, 'completed', now() - interval '2 days'),
  -- Deepak
  (4,  2, 1, 'completed', now() - interval '15 days'),
  (4,  1, 1, 'cancelled', NULL),
  (4,  8, 1, 'completed', now() - interval '6 days'),
  (4, 10, 2, 'completed', now() - interval '4 days'),
  -- Elena
  (5,  3, 2, 'completed', now() - interval '20 days'),
  (5,  7, 1, 'completed', now() - interval '18 days'),
  (5,  5, 3, 'completed', now() - interval '17 days'),
  -- Fatima
  (6,  1, 1, 'completed', now() - interval '8 days'),
  (6,  4, 1, 'completed', now() - interval '7 days'),
  (6,  6, 2, 'pending',   NULL),
  -- George
  (7,  2, 1, 'completed', now() - interval '30 days'),
  (7,  8, 1, 'completed', now() - interval '28 days'),
  (7,  9, 5, 'completed', now() - interval '25 days'),
  -- Hannah
  (8,  3, 1, 'completed', now() - interval '5 days'),
  (8,  5, 2, 'completed', now() - interval '4 days'),
  (8, 10, 1, 'pending',   NULL),
  -- Ivan
  (9,  1, 1, 'completed', now() - interval '3 days'),
  (9,  6, 1, 'cancelled', NULL),
  -- Julia
  (10, 4, 1, 'completed', now() - interval '1 day'),
  (10, 2, 1, 'pending',   NULL);

-- ── reviews (18) — some with body, some rating-only ──────────────────────────

INSERT INTO reviews (user_id, product_id, rating, body) VALUES
  (1,  1, 5, 'Great mouse, very responsive.'),
  (1,  3, 4, 'Nice mug, keeps coffee hot.'),
  (2,  2, 5, 'Best keyboard I have ever used.'),
  (2,  6, 3, NULL),                              -- rating-only
  (3,  5, 2, 'Too thin, falls apart quickly.'),
  (3,  3, 5, 'Perfect size for my desk.'),
  (4,  2, 4, 'Solid build, a bit loud.'),
  (4,  8, 5, 'Crystal clear image, easy setup.'),
  (5,  3, 4, NULL),                              -- rating-only
  (5,  7, 5, 'Best purchase this year.'),
  (6,  1, 4, 'Good value for the price.'),
  (6,  4, 3, 'Decent lamp but flickered once.'),
  (7,  2, 5, 'Mechanical keyboards are life.'),
  (7,  8, 4, 'Good webcam, slight lag on calls.'),
  (8,  3, 5, NULL),                              -- rating-only
  (8,  5, 1, 'Fell apart after a week.'),
  (9,  1, 4, 'Comfortable grip, good battery.'),
  (10, 4, 4, 'Looks great on the desk.');

-- ── RLS (Supabase auto-enables RLS; add permissive SELECT policies) ───────────

ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sibyl_read ON users;
DROP POLICY IF EXISTS sibyl_read ON products;
DROP POLICY IF EXISTS sibyl_read ON orders;
DROP POLICY IF EXISTS sibyl_read ON reviews;

CREATE POLICY sibyl_read ON users    FOR SELECT USING (true);
CREATE POLICY sibyl_read ON products FOR SELECT USING (true);
CREATE POLICY sibyl_read ON orders   FOR SELECT USING (true);
CREATE POLICY sibyl_read ON reviews  FOR SELECT USING (true);
