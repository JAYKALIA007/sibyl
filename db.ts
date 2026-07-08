// The only module that owns the Postgres connection. Connects as the read-only
// role over SSL, with a statement timeout so a runaway query can't hang the tool.
// Exposes runQuery(sql) → { rows, columns } | { error }.

import pg from 'pg'

const { Pool } = pg

let pool: pg.Pool | null = null

// Lazily create the pool on first use — importing this module has NO side effects,
// so pure consumers (e.g. the DDL formatter and its tests) can import transitively
// without needing DATABASE_URL set.
function getPool(): pg.Pool {
  if (pool) return pool
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — copy .env.example to .env and fill it in (see SETUP.md).')
  }
  // Strip sslmode: newer pg treats sslmode=require as verify-full, which rejects
  // Supabase's cert chain. We want encryption without CA verification.
  const url = new URL(DATABASE_URL)
  url.searchParams.delete('sslmode')
  const connectionString = url.toString()
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString)

  pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false }, // encrypt, don't verify CA
    statement_timeout: 5000, // ms — kills a runaway/cartesian query
    connectionTimeoutMillis: 10000,
    max: 3,
  })
  return pool
}

export type QueryResult = { rows: any[]; columns: string[] } | { error: string }

export async function runQuery(sql: string): Promise<QueryResult> {
  try {
    const res = await getPool().query(sql)
    return { rows: res.rows, columns: res.fields.map((f) => f.name) }
  } catch (e: any) {
    return { error: e?.message ?? String(e) }
  }
}

export async function close(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

// Self-test: `npm run db:check` — proves connectivity, the seed, and read-only.
if (import.meta.url === `file://${process.argv[1]}`) {
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
