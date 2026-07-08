# Setup

Two one-time steps to get a working, **read-only** database for Sibyl. Uses your
Supabase project (any Postgres works).

## 1. Load the seed database

Open the Supabase **SQL Editor** and run the contents of [`seed.sql`](./seed.sql).
This creates the `users` / `products` / `orders` tables and sample rows. Run it as
the default (owner) role — the read-only role can't create tables.

## 2. Create the read-only role

The whole safety model depends on Sibyl connecting as a role that can only `SELECT`.
In the SQL Editor, run (change the password):

```sql
CREATE ROLE sibyl_ro LOGIN PASSWORD 'CHANGE_ME';

GRANT CONNECT ON DATABASE postgres TO sibyl_ro;
GRANT USAGE  ON SCHEMA public       TO sibyl_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sibyl_ro;

-- Also cover tables created later:
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sibyl_ro;
```

Verify it's really read-only (this should FAIL with a permission error):

```sql
SET ROLE sibyl_ro;
DELETE FROM orders;   -- expected: permission denied for table orders
RESET ROLE;
```

## 3. Point Sibyl at it

```bash
cp .env.example .env
```

Fill in `DATABASE_URL` using the **`sibyl_ro`** role and your project ref:

```
postgresql://sibyl_ro:CHANGE_ME@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require
```

Find the host/ref under **Project Settings → Database → Connection string → Direct
connection** (port **5432**, not the 6543 pooler). SSL is required.

That's it — the connection string is all Sibyl needs.
