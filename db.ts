// The only module that owns Postgres connections. Connects as the read-only
// role over SSL, with a statement timeout so a runaway query can't hang the tool.
// Exposes runQuery(sql, conn?) → { rows, columns } | { error }.
//
// Multi-connection: a pool per target, keyed by connection id and kept warm once
// opened (the GUI switches between saved DBs without a restart). A call with no
// `conn` uses the process-wide DATABASE_URL pool — the CLI/eval path, unchanged.

import pg from 'pg'
import { isMain } from './isMain.ts'

const { Pool } = pg

// A resolved connection target. The registry (connections.ts) maps a stable id to
// a URL; db.ts only needs those two to open and cache a pool.
export type Conn = { id: string; url: string }

// The env/DATABASE_URL pool's key. Real connection ids come from the registry.
const ENV_KEY = '__env__'

const pools = new Map<string, pg.Pool>()

// Build the pg pool options from a connection URL. Shared by the long-lived pool
// and the throwaway probe so both connect identically (SSL, timeouts).
function poolConfig(rawUrl: string, overrides: Partial<pg.PoolConfig> = {}): pg.PoolConfig {
  // Strip sslmode: newer pg treats sslmode=require as verify-full, which rejects
  // Supabase's cert chain. We want encryption without CA verification.
  const url = new URL(rawUrl)
  url.searchParams.delete('sslmode')
  const connectionString = url.toString()
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString)

  return {
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false }, // encrypt, don't verify CA
    statement_timeout: 5000, // ms — kills a runaway/cartesian query
    connectionTimeoutMillis: 10000,
    max: 3,
    ...overrides,
  }
}

// Lazily create (and cache) the pool for a target on first use — importing this
// module has NO side effects, so pure consumers (e.g. the DDL formatter and its
// tests) can import transitively without needing a database. Kept warm until the
// process exits or the connection is deleted (closePool).
function poolFor(conn?: Conn): pg.Pool {
  const key = conn?.id ?? ENV_KEY
  const cached = pools.get(key)
  if (cached) return cached

  const url = conn?.url ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set — copy .env.example to .env and fill it in (see SETUP.md).')
  }
  const created = new Pool(poolConfig(url))
  pools.set(key, created)
  return created
}

// Test a connection URL in isolation: a throwaway pool that never touches the
// cached one, always torn down. Returns the public-schema table count on success
// so the first-run wizard can both validate the URL and report what it found.
export async function probeConnection(
  url: string,
): Promise<{ ok: true; tableCount: number } | { ok: false; error: string }> {
  let probe: pg.Pool | null = null
  try {
    probe = new Pool(poolConfig(url, { connectionTimeoutMillis: 6000, max: 1 }))
    const res = await probe.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
    )
    return { ok: true, tableCount: res.rows[0].n }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  } finally {
    if (probe) await probe.end().catch(() => {})
  }
}

export type QueryResult = { rows: any[]; columns: string[] } | { error: string }

export async function runQuery(sql: string, conn?: Conn): Promise<QueryResult> {
  try {
    const res = await poolFor(conn).query(sql)
    return { rows: res.rows, columns: res.fields.map((f) => f.name) }
  } catch (e: any) {
    return { error: e?.message ?? String(e) }
  }
}

// Tear down one connection's warm pool — called when a saved connection is deleted.
export async function closePool(id: string): Promise<void> {
  const p = pools.get(id)
  if (!p) return
  pools.delete(id)
  await p.end().catch(() => {})
}

export async function close(): Promise<void> {
  const all = [...pools.values()]
  pools.clear()
  await Promise.all(all.map((p) => p.end().catch(() => {})))
}

// Self-test: `npm run db:check` — proves connectivity, the seed, and read-only.
if (isMain(import.meta.url)) {
  const one = await runQuery('SELECT 1 AS ok')
  console.log('SELECT 1  →', one)

  const tables = await runQuery(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  )
  console.log('tables    →', 'rows' in tables ? tables.rows.map((r) => r.table_name) : tables)

  // Harmless read-only probe: WHERE false changes nothing even if the role COULD
  // write; a read-only role is rejected at the privilege check regardless.
  const probe = await runQuery('UPDATE users SET name = name WHERE false')
  if ('error' in probe) console.log('read-only ✓ (write rejected):', probe.error)
  else console.log('⚠️  WARNING: write was NOT rejected — the role is not read-only!')

  await close()
}
