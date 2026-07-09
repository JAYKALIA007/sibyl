// Shared eval plumbing used by BOTH the single-turn runner (run.ts) and the
// multi-turn runner (run-conversations.ts). Extracted so the "generate SQL →
// guard → run" semantics are identical by construction — if one runner tweaks
// the guard, the other can't silently drift.

import { toSql, NO_ANSWER, type Turn } from '../nl2sql.ts'
import { guard } from '../guard.ts'
import { runQuery } from '../db.ts'
import { type Row } from '../rowsEqual.ts'

export type { Row, Turn }

// The outcome of asking the model for SQL and running it. Mirrors the engine's
// three outcomes, minus the NL summary the eval doesn't need.
export type RunResult =
  | { kind: 'rows'; sql: string; rows: Row[]; columns: string[] }
  | { kind: 'refused' }
  | { kind: 'error'; error: string }

// Deterministic (temperature 0). `history` threads prior turns for the multi-turn
// eval; the single-turn runner leaves it empty so generation stays a pure function.
export async function generateAndRun(
  ddl: string,
  question: string,
  history: Turn[] = []
): Promise<RunResult> {
  const { sql } = await toSql(ddl, question, { temperature: 0, history })
  if (sql === NO_ANSWER) return { kind: 'refused' }

  const g = guard(sql)
  if (!g.ok) return { kind: 'error', error: `guard rejected: ${g.reason}` }

  const res = await runQuery(g.sql)
  if ('error' in res) return { kind: 'error', error: res.error }
  return { kind: 'rows', sql: g.sql, rows: res.rows, columns: res.columns }
}

// Run trusted gold SQL. Throws on failure — a broken gold query is a dataset bug,
// not a model miss, and should surface loudly.
export async function runGold(sql: string): Promise<Row[]> {
  const res = await runQuery(sql)
  if ('error' in res) throw new Error(`gold SQL failed: ${res.error}`)
  return res.rows
}
