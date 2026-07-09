// The HTTP surface — a thin, stateless Express server over the same engine the CLI
// uses. One route: POST /api/ask {question, history} → core.ask. The client owns the
// conversation buffer (ADR 0001); this server keeps no session state.
//
// Bound to loopback only — it holds a live DB connection and must not be reachable
// on the network. No auth in v1: it's a local tool, creds stay server-side in .env.

import express from 'express'
import { ask, loadSchema, type Turn } from './core.ts'
import { close } from './db.ts'
import { mapResult, mapFault } from './responseMapper.ts'

const HOST = '127.0.0.1'
const PORT = Number(process.env.SIBYL_PORT) || 3001

const app = express()
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
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

// Warm the schema/DDL cache before accepting traffic so the first ask isn't cold.
await loadSchema()

const server = app.listen(PORT, HOST, () => {
  console.log(`Sibyl API → http://${HOST}:${PORT}`)
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(async () => {
      await close()
      process.exit(0)
    })
  })
}
