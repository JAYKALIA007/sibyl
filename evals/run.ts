// Execution-accuracy eval — the quality gate.
//
// For each item: generate SQL from the question (temperature 0, deterministic),
// run it, run the trusted gold SQL, and compare the result sets with rowsEqual.
// A row is correct only if the generated query *executes to the same rows* as the
// gold query — not if the SQL text looks similar. Off-schema items pass only if
// the model refuses (emits NO_ANSWER).
//
// The score is the whole point of the project: swap the model (SIBYL_CHAT_MODEL)
// and watch it move. The brain is swappable; the eval decides which brain wins.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadSchema } from '../core.ts'
import { close } from '../db.ts'
import { rowsEqual } from '../rowsEqual.ts'
import { generateAndRun, runGold } from './shared.ts'

type EvalItem = {
  id: string
  rung: string
  question: string
  goldSQL?: string
  ordered?: boolean
  expect?: 'refused'
}

type Outcome = { item: EvalItem; pass: boolean; detail: string }

const here = dirname(fileURLToPath(import.meta.url))
const dataset: EvalItem[] = JSON.parse(readFileSync(join(here, 'dataset.json'), 'utf8'))

async function evaluate(ddl: string, item: EvalItem): Promise<Outcome> {
  const r = await generateAndRun(ddl, item.question)

  // Off-schema items: correct iff the model refuses.
  if (item.expect === 'refused') {
    return r.kind === 'refused'
      ? { item, pass: true, detail: 'refused as expected' }
      : { item, pass: false, detail: 'should have refused' }
  }

  if (r.kind === 'refused') return { item, pass: false, detail: 'unexpected refusal' }
  if (r.kind === 'error') return { item, pass: false, detail: r.error }

  const gold = await runGold(item.goldSQL!)
  const ok = rowsEqual(r.rows, gold, { ordered: item.ordered })
  return ok
    ? { item, pass: true, detail: `${r.rows.length} rows match` }
    : { item, pass: false, detail: `got ${r.rows.length} rows, expected ${gold.length} (or values differ)` }
}

async function main(): Promise<void> {
  const model = process.env.SIBYL_CHAT_MODEL || 'qwen2.5-coder'
  console.log(`\nSibyl execution-accuracy eval — model: ${model}\n`)

  const ddl = await loadSchema()
  const outcomes: Outcome[] = []

  for (const item of dataset) {
    let o: Outcome
    try {
      o = await evaluate(ddl, item)
    } catch (err) {
      o = { item, pass: false, detail: `threw: ${(err as Error).message}` }
    }
    outcomes.push(o)
    const mark = o.pass ? '✓' : '✗'
    console.log(`  ${mark}  [${item.rung}] ${item.id}`)
    if (!o.pass) console.log(`       ${o.detail}`)
  }

  const passed = outcomes.filter((o) => o.pass).length
  const total = outcomes.length
  const pct = ((passed / total) * 100).toFixed(0)
  console.log(`\n  Score: ${passed}/${total} (${pct}%)\n`)

  await close()
  process.exit(passed === total ? 0 : 1)
}

await main()
