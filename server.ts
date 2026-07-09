// The HTTP surface — a thin, stateless Express server over the same engine the CLI
// uses. POST /api/ask {question, history, connectionId} → core.ask. The client owns
// both the conversation buffer AND the active connection (ADR 0001); this server
// keeps no session state — it just resolves the connectionId to a pool per request
// and caches pools/DDL by id.
//
// Bound to loopback only — it holds live DB connections and must not be reachable
// on the network. No auth in v1: it's a local tool, creds stay server-side.

import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ask, loadSchema, type Turn, type Conn } from './core.ts'
import { close, closePool, runQuery } from './db.ts'
import { checkOllama, CHAT_MODEL, OLLAMA } from './ollama.ts'
import { getSuggestions } from './suggestions.ts'
import { mapResult, mapFault } from './responseMapper.ts'
import {
  listConnections,
  findConnection,
  addConnection,
  deleteConnectionById,
  renameConnectionById,
  connectionLabel,
} from './connections.ts'

const HOST = '127.0.0.1'
const PORT = Number(process.env.SIBYL_PORT) || 3001

// Serving the built SPA is a SEPARATE concern from serving the API: on the web it's
// convenient to do both from one process, but a future desktop shell (Tauri/Wails)
// serves the assets itself and wants the sidecar to expose ONLY /api. Toggle off
// with SIBYL_SERVE_STATIC=false.
const SERVE_STATIC = process.env.SIBYL_SERVE_STATIC !== 'false'
const WEB_DIST = join(dirname(fileURLToPath(import.meta.url)), 'web', 'dist')

const app = express()
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

// ── connection registry ──────────────────────────────────────────────────────
// The saved DBs the client's sidebar manages. Reads never probe (the list stays
// instant); only the active connection's liveness shows, via /api/meta.

app.get('/api/connections', (_req, res) => {
  res.json(listConnections())
})

app.post('/api/connections', async (req, res) => {
  const { name, url } = (req.body ?? {}) as { name?: unknown; url?: unknown }
  if (typeof url !== 'string' || !url.trim()) {
    res.status(400).json({ kind: 'fault', error: 'url (non-empty string) is required' })
    return
  }
  // Probe-before-save: a bad URL returns a classified hint and is NOT persisted.
  const result = await addConnection({ name: typeof name === 'string' ? name : undefined, url })
  if (!result.ok) {
    res.status(422).json({ kind: 'fault', error: result.hint, detail: result.error })
    return
  }
  res.status(201).json({ ...result.view, tables: result.tables })
})

app.patch('/api/connections/:id', (req, res) => {
  const { name } = (req.body ?? {}) as { name?: unknown }
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ kind: 'fault', error: 'name (non-empty string) is required' })
    return
  }
  const view = renameConnectionById(req.params.id, name.trim())
  if (!view) {
    res.status(404).json({ kind: 'fault', error: 'unknown connection' })
    return
  }
  res.json(view)
})

app.delete('/api/connections/:id', async (req, res) => {
  await closePool(req.params.id) // tear down its warm pool
  deleteConnectionById(req.params.id)
  res.status(204).end()
})

// Resolve the ?connection=<id> (or body connectionId) to a live target, or 400.
// The client owns which connection is active; the server just looks it up.
function resolveConn(id: unknown, res: express.Response): Conn | null {
  const c = typeof id === 'string' && id ? findConnection(id) : undefined
  if (!c) {
    res.status(400).json({ kind: 'fault', error: 'unknown or missing connection' })
    return null
  }
  return { id: c.id, url: c.url }
}

// ── engine, scoped to a connection ───────────────────────────────────────────

// Lightweight metadata for the status bar: table count, active model, DB label.
app.get('/api/meta', async (req, res) => {
  const conn = resolveConn(req.query.connection, res)
  if (!conn) return
  try {
    const ddl = await loadSchema(conn)
    const tables = (ddl.match(/^CREATE TABLE/gm) ?? []).length
    res.json({ tables, model: CHAT_MODEL, database: connectionLabel(conn.url) })
  } catch (err) {
    const { status, body } = mapFault(err)
    res.status(status).json(body)
  }
})

// The full DDL Sibyl prompts with, plus per-table row counts — backs the GUI's
// /schema and /tables commands (the CLI's .schema / .tables). Row counts come from
// pg_stat (approximate, like the CLI); '?' until a table's first ANALYZE.
app.get('/api/schema', async (req, res) => {
  const conn = resolveConn(req.query.connection, res)
  if (!conn) return
  try {
    const ddl = await loadSchema(conn)
    const q = await runQuery(`
      SELECT relname AS table,
        CASE WHEN n_live_tup = 0 THEN '?' ELSE n_live_tup::text END AS rows
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY relname`, conn)
    res.json({ ddl, tables: 'error' in q ? [] : q.rows })
  } catch (err) {
    const { status, body } = mapFault(err)
    res.status(status).json(body)
  }
})

// Schema-aware starter questions for the empty state (generated once per connection).
app.get('/api/suggestions', async (req, res) => {
  const conn = resolveConn(req.query.connection, res)
  if (!conn) return
  try {
    res.json({ suggestions: await getSuggestions(await loadSchema(conn), conn.id) })
  } catch (err) {
    const { status, body } = mapFault(err)
    res.status(status).json(body)
  }
})

app.post('/api/ask', async (req, res) => {
  const { question, history, connectionId } = (req.body ?? {}) as {
    question?: unknown
    history?: unknown
    connectionId?: unknown
  }

  if (typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ kind: 'fault', error: 'question (non-empty string) is required' })
    return
  }
  const conn = resolveConn(connectionId, res)
  if (!conn) return
  const turns: Turn[] = Array.isArray(history) ? (history as Turn[]) : []

  try {
    const { status, body } = mapResult(await ask(question, turns, conn))
    res.status(status).json(body)
  } catch (err) {
    // A genuine fault (Ollama unreachable, DB dead, core threw) → 5xx, distinct
    // from the three domain outcomes which are all 200.
    const { status, body } = mapFault(err)
    res.status(status).json(body)
  }
})

// Static SPA — mounted AFTER the API routes, and never shadowing /api. Only when
// enabled and actually built. A GET fallback returns index.html for client routes;
// unknown /api paths fall through to a JSON 404.
if (SERVE_STATIC && existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(join(WEB_DIST, 'index.html'))
  })
} else if (SERVE_STATIC) {
  console.log('web/dist not found — API only. Run `npm run web:build` to serve the UI.')
}

app.use('/api', (_req, res) => {
  res.status(404).json({ kind: 'fault', error: 'not found' })
})

// Preflight the local LLM (non-interactive here): refuse to start with a clear
// message rather than 500-ing on the first question.
const ollama = await checkOllama()
if (!ollama.ok) {
  if (ollama.reason === 'unreachable') {
    console.error(`Can't reach Ollama at ${OLLAMA} — install from https://ollama.com and start it.`)
  } else {
    console.error(`Ollama model "${ollama.model}" isn't pulled — run: ollama pull ${ollama.model}`)
  }
  process.exit(1)
}

// No hard DB requirement at boot anymore: connections are added/switched from the
// UI, so the server can start with an empty registry (the app shows an
// add-your-first-connection state). We only warm a schema if one already exists.
const server = app.listen(PORT, HOST, () => {
  console.log(`Sibyl API → http://${HOST}:${PORT}`)
  // Best-effort warm of the first saved connection's schema + starter questions off
  // the request path, so the common single-DB case isn't cold on first ask. The
  // client picks the actual active connection; the endpoints regenerate on demand.
  const [first] = listConnections()
  if (first) {
    const c = findConnection(first.id)
    if (c) {
      const conn: Conn = { id: c.id, url: c.url }
      loadSchema(conn)
        .then((ddl) => getSuggestions(ddl, conn.id))
        .catch(() => {})
    }
  }
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(async () => {
      await close()
      process.exit(0)
    })
  })
}
