-- Sibyl seed database — a tiny e-commerce schema (users · products · orders).
-- This is the FIXED, KNOWN database the eval grades against, and a realistic schema
-- (with foreign keys) to demo joins. Load it into your Postgres/Supabase once, as
-- an owner/superuser (the read-only role can't create tables — see SETUP.md).

DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  email      text UNIQUE NOT NULL,
  country    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id       serial PRIMARY KEY,
  name     text NOT NULL,
  category text NOT NULL,
  price    numeric(10,2) NOT NULL
);

CREATE TABLE orders (
  id         serial PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id),
  product_id int NOT NULL REFERENCES products(id),
  quantity   int NOT NULL DEFAULT 1,
  status     text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO users (name, email, country) VALUES
  ('Alice Johnson', 'alice@example.com',  'USA'),
  ('Bob Smith',     'bob@example.com',    'USA'),
  ('Carla Diaz',    'carla@example.com',  'Mexico'),
  ('Deepak Rao',    'deepak@example.com', 'India'),
  ('Elena Petrova', 'elena@example.com',  'Germany');

INSERT INTO products (name, category, price) VALUES
  ('Wireless Mouse',      'Electronics', 24.99),
  ('Mechanical Keyboard', 'Electronics', 89.50),
  ('Coffee Mug',          'Home',        12.00),
  ('Desk Lamp',           'Home',        34.75),
  ('Notebook',            'Stationery',   4.50),
  ('USB-C Cable',         'Electronics',  9.99);

INSERT INTO orders (user_id, product_id, quantity, status) VALUES
  (1, 1, 2, 'completed'),
  (1, 3, 1, 'completed'),
  (2, 2, 1, 'completed'),
  (2, 6, 3, 'completed'),
  (3, 4, 1, 'pending'),
  (3, 5, 5, 'completed'),
  (4, 2, 1, 'completed'),
  (4, 1, 1, 'cancelled'),
  (5, 3, 2, 'completed'),
  (1, 6, 1, 'completed');

-- Supabase auto-enables Row Level Security on new public tables, which hides ALL
-- rows from the read-only role (RLS with no policy = deny all). Add permissive
-- SELECT policies so Sibyl can read. Writes stay blocked by the role's lack of
-- INSERT/UPDATE/DELETE grants — RLS is a separate, orthogonal layer.
ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders   ENABLE ROW LEVEL SECURITY;
CREATE POLICY sibyl_read ON users    FOR SELECT USING (true);
CREATE POLICY sibyl_read ON products FOR SELECT USING (true);
CREATE POLICY sibyl_read ON orders   FOR SELECT USING (true);
