// Boundary tests for the core engine. The engine is driven through scripted in-memory
// ports (no Postgres, no Ollama), so the orchestration — retry loop, refusal,
// summarize degradation, schema caching — is asserted at the public interface.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEngine, type EngineDeps } from './core.ts'
import { NO_ANSWER } from './nl2sql.ts'
import type { Schema } from './introspect.ts'

const SCHEMA: Schema = [
  { name: 'users', columns: [{ name: 'id', type: 'integer', notNull: true }], primaryKey: ['id'], foreignKeys: [] },
]

// A scripted set of ports. Each field can be a fixed value or a per-call queue.
function makeDeps(overrides: Partial<EngineDeps> = {}): EngineDeps & { calls: Record<string, number> } {
  const calls = { getSchema: 0, toSql: 0, runQuery: 0, summarize: 0 }
  const base: EngineDeps = {
    getSchema: async () => {
      calls.getSchema++
      return SCHEMA
    },
    toSql: async () => {
      calls.toSql++
      return { sql: 'SELECT * FROM users', usage: { promptTokens: 10, outputTokens: 5 } }
    },
    runQuery: async () => {
      calls.runQuery++
      return { rows: [{ id: 1 }], columns: ['id'] }
    },
    summarize: async () => {
      calls.summarize++
      return 'One user.'
    },
    numCtx: 8192,
  }
  return Object.assign({ calls }, base, overrides)
}

// Returns a fake that yields each queued value in turn (throws if a value is Error).
function queue<T>(values: (T | Error)[]): () => Promise<T> {
  let i = 0
  return async () => {
    const v = values[Math.min(i, values.length - 1)]
    i++
    if (v instanceof Error) throw v
    return v
  }
}

test('answer: happy path returns rows, summary, usage, attempts=1', async () => {
  const deps = makeDeps()
  const engine = createEngine(deps)
  const r = await engine.ask('how many users?')
  assert.equal(r.kind, 'answer')
  if (r.kind !== 'answer') return
  assert.deepEqual(r.rows, [{ id: 1 }])
  assert.equal(r.summary, 'One user.')
  assert.equal(r.attempts, 1)
  assert.equal(r.usage.numCtx, 8192)
  assert.match(r.sql, /LIMIT/) // guard injected a limit
})

test('refusal: NO_ANSWER short-circuits before running any query', async () => {
  const deps = makeDeps({ toSql: async () => ({ sql: NO_ANSWER, usage: {} }) })
  const engine = createEngine(deps)
  const r = await engine.ask('who is the ceo of google?')
  assert.equal(r.kind, 'refused')
  assert.equal(deps.calls.runQuery, 0)
})

test('retry: guard rejects the first SQL, model fixes it, second attempt answers', async () => {
  const toSql = queue([
    { sql: 'DELETE FROM users', usage: {} }, // guard rejects (not a SELECT)
    { sql: 'SELECT * FROM users', usage: {} },
  ])
  const deps = makeDeps({ toSql })
  const engine = createEngine(deps)
  const r = await engine.ask('q')
  assert.equal(r.kind, 'answer')
  if (r.kind !== 'answer') return
  assert.equal(r.attempts, 2)
  assert.equal(deps.calls.runQuery, 1) // only the passing SQL was executed
})

test('retry: DB error is fed back, second attempt succeeds', async () => {
  const runQuery = queue<import('./db.ts').QueryResult>([
    { error: 'relation "user" does not exist' },
    { rows: [{ id: 1 }], columns: ['id'] },
  ])
  const deps = makeDeps({ runQuery })
  const engine = createEngine(deps)
  const r = await engine.ask('q')
  assert.equal(r.kind, 'answer')
  if (r.kind !== 'answer') return
  assert.equal(r.attempts, 2)
})

test('error: exhausts MAX_ATTEMPTS on persistent DB error, returns last sql + error', async () => {
  const deps = makeDeps({ runQuery: async () => ({ error: 'boom' }) })
  const engine = createEngine(deps)
  const r = await engine.ask('q')
  assert.equal(r.kind, 'error')
  if (r.kind !== 'error') return
  assert.equal(r.attempts, 3)
  assert.equal(r.error, 'boom')
  assert.match(r.sql, /SELECT \* FROM users/)
})

test('summarize failure degrades to a row count, does not fail the answer', async () => {
  const deps = makeDeps({
    summarize: async () => {
      throw new Error('ollama timed out')
    },
  })
  const engine = createEngine(deps)
  const r = await engine.ask('q')
  assert.equal(r.kind, 'answer')
  if (r.kind !== 'answer') return
  assert.equal(r.summary, 'Returned 1 row.')
})

test('toSql throw is a fault: it propagates instead of becoming an error result', async () => {
  const deps = makeDeps({
    toSql: async () => {
      throw new Error('model unreachable')
    },
  })
  const engine = createEngine(deps)
  await assert.rejects(() => engine.ask('q'), /model unreachable/)
})

test('loadSchema caches by connection and dedupes concurrent cold loads', async () => {
  let resolve!: (s: Schema) => void
  const gate = new Promise<Schema>((r) => (resolve = r))
  const deps = makeDeps({
    getSchema: async () => {
      deps.calls.getSchema++
      return gate
    },
  })
  const engine = createEngine(deps)
  const conn = { id: 'db1', url: 'postgres://x' }
  const a = engine.loadSchema(conn)
  const b = engine.loadSchema(conn) // concurrent, cold — must share the in-flight load
  resolve(SCHEMA)
  await Promise.all([a, b])
  assert.equal(deps.calls.getSchema, 1)
  await engine.loadSchema(conn) // now cached
  assert.equal(deps.calls.getSchema, 1)
})

test('loadSchema keys the cache per connection', async () => {
  const deps = makeDeps()
  const engine = createEngine(deps)
  await engine.loadSchema({ id: 'db1', url: 'x' })
  await engine.loadSchema({ id: 'db2', url: 'y' })
  assert.equal(deps.calls.getSchema, 2)
})

test('runSql: guard rejects a non-SELECT before touching the executor', async () => {
  const deps = makeDeps()
  const engine = createEngine(deps)
  const r = await engine.runSql('DROP TABLE users')
  assert.equal(r.kind, 'rejected')
  assert.equal(deps.calls.runQuery, 0)
})

test('runSql: surfaces a DB error', async () => {
  const deps = makeDeps({ runQuery: async () => ({ error: 'syntax error' }) })
  const engine = createEngine(deps)
  const r = await engine.runSql('SELECT * FROM users')
  assert.equal(r.kind, 'error')
  if (r.kind !== 'error') return
  assert.equal(r.error, 'syntax error')
})

test('runSql: returns guarded rows on success', async () => {
  const deps = makeDeps()
  const engine = createEngine(deps)
  const r = await engine.runSql('SELECT * FROM users')
  assert.equal(r.kind, 'sql')
  if (r.kind !== 'sql') return
  assert.deepEqual(r.rows, [{ id: 1 }])
  assert.match(r.sql, /LIMIT/)
})
