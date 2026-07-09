// The core engine — the single brain both the CLI and the eval call. Orchestrates:
//   load schema (DDL) → generate SQL → guard → run → on error, feed it back and
//   retry (cap 3) → summarize the rows → refuse gracefully on off-schema questions.
//
// Returns a discriminated result so every caller handles the three outcomes
// explicitly: an answer, a refusal, or a give-up-after-retries error.

import { getSchema, toDDL } from './introspect.ts'
import { toSql, NO_ANSWER, type Turn } from './nl2sql.ts'
import { guard } from './guard.ts'
import { runQuery } from './db.ts'
import { generate } from './ollama.ts'

export type { Turn }

export type AskResult =
  | { kind: 'answer'; sql: string; rows: any[]; columns: string[]; summary: string; attempts: number }
  | { kind: 'refused'; reason: string }
  | { kind: 'error'; sql: string; error: string; attempts: number }

const MAX_ATTEMPTS = 3
const SUMMARY_ROW_CAP = 50

// Schema is stable within a session — fetch the DDL once and reuse it.
let cachedDDL: string | null = null
export async function loadSchema(force = false): Promise<string> {
  if (!cachedDDL || force) cachedDDL = toDDL(await getSchema())
  return cachedDDL
}

// A second, small LLM call: turn the result rows into a one-line answer. Capped so a
// huge result set can't blow the context window. Empty results skip the model.
async function summarize(question: string, rows: any[], columns: string[]): Promise<string> {
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

// `history` is the surface's conversation buffer (prior successful turns). The core
// itself holds NO conversation state — each surface owns and passes its own, so the
// same core can serve many concurrent sessions (see docs/adr/0001).
export async function ask(question: string, history: Turn[] = []): Promise<AskResult> {
  const ddl = await loadSchema()

  let feedback: { sql: string; error: string } | undefined
  let attempts = 0

  while (attempts < MAX_ATTEMPTS) {
    attempts++

    const sql = await toSql(ddl, question, { feedback, history })
    if (sql === NO_ANSWER) {
      return { kind: 'refused', reason: "That can't be answered from this database's schema." }
    }

    const g = guard(sql)
    if (!g.ok) {
      feedback = { sql, error: `Rejected by safety guard: ${g.reason}` }
      continue // let the model try to fix it
    }

    const res = await runQuery(g.sql)
    if ('error' in res) {
      feedback = { sql: g.sql, error: res.error } // feed the Postgres error back
      continue
    }

    // Success — note that 0 rows is a valid answer, not an error.
    const summary = await summarize(question, res.rows, res.columns)
    return { kind: 'answer', sql: g.sql, rows: res.rows, columns: res.columns, summary, attempts }
  }

  return {
    kind: 'error',
    sql: feedback?.sql ?? '',
    error: feedback?.error ?? 'failed to produce a valid query',
    attempts,
  }
}

// `npm run core:check` — run a few questions end-to-end through the engine.
if (import.meta.url === `file://${process.argv[1]}`) {
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
