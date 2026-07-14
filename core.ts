// The core engine — the single brain both the CLI and the eval call. Orchestrates:
//   load schema (DDL) → generate SQL → guard → run → on error, feed it back and
//   retry (cap 3) → summarize the rows → refuse gracefully on off-schema questions.
//
// Returns a discriminated result so every caller handles the three outcomes
// explicitly: an answer, a refusal, or a give-up-after-retries error.
//
// The orchestration depends on three seams — schema introspection, the LLM, and the
// query executor — through an injected `EngineDeps` port. Production wires the real
// Postgres + Ollama adapters (the module-level `ask`/`runSql`/`loadSchema` below);
// tests wire in-memory fakes and drive the retry loop deterministically, so the
// heart of the product is unit-tested without a database or a model running.

import { getSchema as pgGetSchema, toDDL, type Schema } from './introspect.ts'
import { toSql as llmToSql, NO_ANSWER, type Turn } from './nl2sql.ts'
import { guard } from './guard.ts'
import { runQuery as pgRunQuery, type Conn, type QueryResult } from './db.ts'
import { generate, NUM_CTX, type Usage } from './ollama.ts'
import { isMain } from './isMain.ts'

export type { Conn }

export type { Turn }

// Token usage of the SQL-generation call (schema + history + question), plus the
// configured context window, so a surface can show how full the window is.
export type AskUsage = Usage & { numCtx: number }

export type AskResult =
  | { kind: 'answer'; sql: string; rows: any[]; columns: string[]; summary: string; attempts: number; usage: AskUsage }
  | { kind: 'refused'; reason: string }
  | { kind: 'error'; sql: string; error: string; attempts: number }

export type SqlOutcome =
  | { kind: 'sql'; sql: string; columns: string[]; rows: any[] }
  | { kind: 'rejected'; reason: string }
  | { kind: 'error'; error: string }

const MAX_ATTEMPTS = 3
const SUMMARY_ROW_CAP = 50
const ENV_KEY = '__env__'

// One failed attempt's SQL + error, threaded back into the next prompt so the model
// can fix its own query.
type Feedback = { sql: string; error: string }

// The seams the engine orchestrates. Each is a single function so a test can supply a
// scripted fake and assert on the loop's behaviour (retries, refusal, degradation).
export type EngineDeps = {
  // Schema port: read a connection's live structure (impure I/O in production).
  getSchema: (conn?: Conn) => Promise<Schema>
  // LLM port (generate): English + DDL → a single SQL string (+ token usage).
  toSql: (
    ddl: string,
    question: string,
    opts: { feedback?: Feedback; history?: Turn[]; onToken?: (t: string) => void }
  ) => Promise<{ sql: string; usage: Usage }>
  // Executor port: run guarded SQL and return rows/columns or a DB error.
  runQuery: (sql: string, conn?: Conn) => Promise<QueryResult>
  // LLM port (summarize): rows → a one-line natural-language answer.
  summarize: (question: string, rows: any[], columns: string[]) => Promise<string>
  // The model's context window, surfaced in AskUsage.
  numCtx: number
}

export type AskOpts = {
  onSqlToken?: (t: string) => void
  onRetry?: (attempt: number) => void
}

export type Engine = {
  loadSchema: (conn?: Conn, force?: boolean) => Promise<string>
  ask: (question: string, history?: Turn[], conn?: Conn, opts?: AskOpts) => Promise<AskResult>
  runSql: (sql: string, conn?: Conn) => Promise<SqlOutcome>
}

// A deterministic answer if the (cosmetic) summarize call fails — a successful query
// must never be lost because the one-line summary LLM call threw or timed out.
function summaryFallback(rows: any[]): string {
  if (rows.length === 0) return 'No rows matched.'
  return `Returned ${rows.length} row${rows.length === 1 ? '' : 's'}.`
}

// Build an engine over a set of ports. All state (the DDL cache) is per-engine, so a
// test gets a fresh cache and production shares one module-level instance.
export function createEngine(deps: EngineDeps): Engine {
  // Schema is stable within a session — fetch the DDL once per connection and reuse
  // it. Cached by connection id so switching DBs in the GUI doesn't re-introspect a
  // database we've already seen (and never serves one DB's schema for another).
  // Concurrent callers for the same key share the one in-flight introspection, so two
  // simultaneous requests on a cold connection don't both hit the database.
  const ddlCache = new Map<string, string>()
  const ddlInflight = new Map<string, Promise<string>>()

  async function loadSchema(conn?: Conn, force = false): Promise<string> {
    const key = conn?.id ?? ENV_KEY
    if (!force) {
      const cached = ddlCache.get(key)
      if (cached !== undefined) return cached
    }
    let pending = ddlInflight.get(key)
    if (!pending) {
      pending = (async () => toDDL(await deps.getSchema(conn)))()
        .then((ddl) => {
          ddlCache.set(key, ddl)
          return ddl
        })
        .finally(() => {
          ddlInflight.delete(key)
        })
      ddlInflight.set(key, pending)
    }
    return pending
  }

  // `history` is the surface's conversation buffer (prior successful turns). The core
  // itself holds NO conversation state — each surface owns and passes its own, so the
  // same core can serve many concurrent sessions (see docs/adr/0001).
  async function ask(question: string, history: Turn[] = [], conn?: Conn, opts?: AskOpts): Promise<AskResult> {
    const ddl = await loadSchema(conn)

    let feedback: Feedback | undefined
    let attempts = 0

    while (attempts < MAX_ATTEMPTS) {
      attempts++
      if (attempts > 1) opts?.onRetry?.(attempts)

      // A throw here is a genuine fault (model unreachable) — let it propagate so the
      // surface renders it as a fault (5xx / fault banner) rather than masking an
      // outage as a normal "couldn't build a query" result.
      const { sql, usage } = await deps.toSql(ddl, question, { feedback, history, onToken: opts?.onSqlToken })
      if (sql === NO_ANSWER) {
        return { kind: 'refused', reason: "That can't be answered from this database's schema." }
      }

      const g = guard(sql)
      if (!g.ok) {
        feedback = { sql, error: `Rejected by safety guard: ${g.reason}` }
        continue // let the model try to fix it
      }

      const res = await deps.runQuery(g.sql, conn)
      if ('error' in res) {
        feedback = { sql: g.sql, error: res.error } // feed the Postgres error back
        continue
      }

      // Success — note that 0 rows is a valid answer, not an error. The summary is
      // cosmetic: degrade to a row count rather than fail the whole query if it throws.
      let summary: string
      try {
        summary = await deps.summarize(question, res.rows, res.columns)
      } catch {
        summary = summaryFallback(res.rows)
      }
      return {
        kind: 'answer',
        sql: g.sql,
        rows: res.rows,
        columns: res.columns,
        summary,
        attempts,
        usage: { ...usage, numCtx: deps.numCtx },
      }
    }

    return {
      kind: 'error',
      sql: feedback?.sql ?? '',
      error: feedback?.error ?? 'failed to produce a valid query',
      attempts,
    }
  }

  // Run raw user-written SQL (the GUI's /sql escape hatch) — same read-only guard as
  // the model's SQL, so it can only ever SELECT. No LLM: deterministic, no summary.
  async function runSql(sql: string, conn?: Conn): Promise<SqlOutcome> {
    const g = guard(sql)
    if (!g.ok) return { kind: 'rejected', reason: g.reason }
    const res = await deps.runQuery(g.sql, conn)
    if ('error' in res) return { kind: 'error', error: res.error }
    return { kind: 'sql', sql: g.sql, columns: res.columns, rows: res.rows }
  }

  return { loadSchema, ask, runSql }
}

// The production summarize: a second, small LLM call turning result rows into a
// one-line answer. Capped so a huge result set can't blow the context window. Empty
// results skip the model.
async function defaultSummarize(question: string, rows: any[], columns: string[]): Promise<string> {
  if (rows.length === 0) return 'No rows matched.'
  const preview = JSON.stringify(rows.slice(0, SUMMARY_ROW_CAP))
  const prompt =
    `Question: ${question}\n` +
    `Result columns: ${columns.join(', ')}\n` +
    `Rows (showing up to ${SUMMARY_ROW_CAP} of ${rows.length}): ${preview}\n\n` +
    `Answer the question in ONE short sentence using only these results.`
  const out = await generate(prompt, {
    temperature: 0,
    system: 'You state the answer to a question from SQL results in one concise sentence. No preamble, no markdown.',
  })
  return out.trim()
}

// The single production engine: real Postgres + Ollama adapters. The module-level
// exports below delegate to it so every existing caller (cli, server, evals) keeps
// working unchanged, while sharing one DDL cache.
const engine = createEngine({
  getSchema: pgGetSchema,
  toSql: (ddl, question, opts) => llmToSql(ddl, question, opts),
  runQuery: pgRunQuery,
  summarize: defaultSummarize,
  numCtx: NUM_CTX,
})

export const loadSchema = engine.loadSchema
export const ask = engine.ask
export const runSql = engine.runSql

// `npm run core:check` — run a few questions end-to-end through the engine.
if (isMain(import.meta.url)) {
  const { close } = await import('./db.ts')
  const questions = [
    'How many users are there?',
    'What is the total revenue from completed orders?',
    'List each product name and how many times it was ordered, most first.',
    'Who is the CEO of Google?',
  ]
  for (const q of questions) {
    const r = await ask(q)
    console.log(`\nQ: ${q}`)
    if (r.kind === 'refused') console.log(`  refused: ${r.reason}`)
    else if (r.kind === 'error') console.log(`  error after ${r.attempts} attempts: ${r.error}`)
    else {
      console.log(`  SQL (${r.attempts} attempt${r.attempts > 1 ? 's' : ''}): ${r.sql.replace(/\s+/g, ' ')}`)
      console.log(`  rows: ${r.rows.length}`)
      console.log(`  summary: ${r.summary}`)
    }
  }
  await close()
}
