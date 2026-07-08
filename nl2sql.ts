// Turn an English question + the schema DDL into a single PostgreSQL SELECT.
// Deterministic by default (temperature 0) so the same question yields the same SQL
// — important for the eval. Emits the sentinel NO_ANSWER when the question can't be
// answered from the schema (the core engine turns that into a graceful refusal).

import { generate } from './ollama.ts'

export const NO_ANSWER = 'NO_ANSWER'

const SYSTEM = [
  'You are a PostgreSQL expert. Convert the user question into a single valid',
  'PostgreSQL SELECT query using ONLY the provided schema.',
  'Rules:',
  '- Output ONLY the SQL query. No prose, no markdown fences, no comments.',
  '- Use only tables and columns that exist in the schema.',
  '- Prefer explicit JOINs using the foreign keys shown in the schema.',
  `- If the question cannot be answered from the schema, output exactly: ${NO_ANSWER}`,
].join('\n')

function buildPrompt(ddl: string, question: string): string {
  return `Schema:\n${ddl}\n\nQuestion: ${question}\n\nSQL:`
}

// Strip a markdown code fence if the model wrapped the SQL in one.
function extractSql(raw: string): string {
  const s = raw.trim()
  const fence = s.match(/```(?:sql)?\s*([\s\S]*?)```/i)
  return (fence ? fence[1] : s).trim()
}

export async function toSql(
  ddl: string,
  question: string,
  opts: { temperature?: number } = {}
): Promise<string> {
  const raw = await generate(buildPrompt(ddl, question), {
    temperature: opts.temperature ?? 0,
    system: SYSTEM,
  })
  return extractSql(raw)
}

// `npm run nl2sql:check` — generate SQL for sample questions against the live schema
// and run them, to eyeball quality end-to-end.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { getSchema, toDDL } = await import('./introspect.ts')
  const { guard } = await import('./guard.ts')
  const { runQuery, close } = await import('./db.ts')

  const ddl = toDDL(await getSchema())
  const questions = [
    'How many users are there?',
    'How many orders did each user place? Show their name and the order count.',
    'What is the total revenue from completed orders?',
    'Which product category has the most orders?',
    'Who is the CEO of Google?', // off-schema → expect NO_ANSWER
  ]

  for (const q of questions) {
    console.log(`\nQ: ${q}`)
    const sql = await toSql(ddl, q)
    if (sql === NO_ANSWER) {
      console.log('  → NO_ANSWER (not in schema)')
      continue
    }
    console.log(`  SQL: ${sql.replace(/\s+/g, ' ')}`)
    const g = guard(sql)
    if (!g.ok) {
      console.log(`  guard rejected: ${g.reason}`)
      continue
    }
    const res = await runQuery(g.sql)
    console.log('  rows:', 'rows' in res ? JSON.stringify(res.rows) : res)
  }
  await close()
}
