// The HTTP surface — a thin, stateless Express server over the same engine the CLI
// uses. One route: POST /api/ask {question, history} → core.ask. The client owns the
// conversation buffer (ADR 0001); this server keeps no session state.
//
// Bound to loopback only — it holds a live DB connection and must not be reachable
// on the network. No auth in v1: it's a local tool, creds stay server-side in .env.

import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ask, loadSchema, type Turn } from './core.ts'
import { close, runQuery } from './db.ts'
import { checkOllama, CHAT_MODEL, OLLAMA } from './ollama.ts'
import { getSuggestions } from './suggestions.ts'
import { mapResult, mapFault } from './responseMapper.ts'

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

// A password-free label for the connected database (user@host/db) for the UI's
// status bar — never the raw connection string.
function dbLabel(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '')
    return `${u.username}@${u.hostname}/${u.pathname.replace(/^\//, '') || 'postgres'}`
  } catch {
    return ''
  }
}

// Lightweight metadata for the status bar: table count, active model, DB label.
app.get('/api/meta', async (_req, res) => {
  try {
    const ddl = await loadSchema()
    const tables = (ddl.match(/^CREATE TABLE/gm) ?? []).length
    res.json({ tables, model: CHAT_MODEL, database: dbLabel() })
  } catch (err) {
    const { status, body } = mapFault(err)
    res.status(status).json(body)
  }
})

// The full DDL Sibyl prompts with, plus per-table row counts — backs the GUI's
// /schema and /tables commands (the CLI's .schema / .tables). Row counts come from
// pg_stat (approximate, like the CLI); '?' until a table's first ANALYZE.
app.get('/api/schema', async (_req, res) => {
  try {
    const ddl = await loadSchema()
    const q = await runQuery(`
      SELECT relname AS table,
        CASE WHEN n_live_tup = 0 THEN '?' ELSE n_live_tup::text END AS rows
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY relname`)
    res.json({ ddl, tables: 'error' in q ? [] : q.rows })
  } catch (err) {
    const { status, body } = mapFault(err)
    res.status(status).json(body)
  }
})

// Schema-aware starter questions for the empty state (generated once, cached).
app.get('/api/suggestions', async (_req, res) => {
  try {
    res.json({ suggestions: await getSuggestions(await loadSchema()) })
  } catch (err) {
    const { status, body } = mapFault(err)
    res.status(status).json(body)
  }
})

app.post('/api/ask', async (req, res) => {
  const { question, history } = (req.body ?? {}) as { question?: unknown; history?: unknown }

  if (typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ kind: 'fault', error: 'question (non-empty string) is required' })
    return
  }
  const turns: Turn[] = Array.isArray(history) ? (history as Turn[]) : []

  try {
    const { status, body } = mapResult(await ask(question, turns))
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

// Warm the schema/DDL cache before accepting traffic so the first ask isn't cold.
await loadSchema()

const server = app.listen(PORT, HOST, () => {
  console.log(`Sibyl API → http://${HOST}:${PORT}`)
  // Warm the starter-question cache off the request path so the empty state is
  // ready when the browser asks. Best-effort — the endpoint regenerates on demand.
  loadSchema().then((ddl) => getSuggestions(ddl)).catch(() => {})
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(async () => {
      await close()
      process.exit(0)
    })
  })
}
