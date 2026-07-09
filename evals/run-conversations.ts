// Multi-turn (conversational) execution-accuracy eval.
//
// Each conversation is a sequence of steps; later steps refer back to earlier ones
// ("how many did THEY order?"). We SELF-THREAD: step N is generated with the model's
// OWN prior SQL as history — exactly what the CLI does at runtime — not the gold SQL.
// So a wrong early turn can cascade, which is a real failure mode we want to measure.
//
// Two scores are reported:
//   - per-step        — how many individual turns are correct
//   - per-conversation — how many full conversations pass end-to-end
// The gap between them is the cascade.
//
// Referential steps also get a NO-HISTORY CONTROL: the same step run with empty
// history must NOT match the gold. That proves the *history* — not the model
// guessing — is what makes it pass. If the control also matches, the step wasn't
// truly referential and the dataset row is flagged as weak.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadSchema } from '../core.ts'
import { close } from '../db.ts'
import { rowsEqual } from '../rowsEqual.ts'
import { generateAndRun, runGold, type Turn } from './shared.ts'

type Step = {
  question: string
  goldSQL: string
  ordered?: boolean
  referential?: boolean
}
type Conversation = { id: string; steps: Step[] }

const here = dirname(fileURLToPath(import.meta.url))
const conversations: Conversation[] = JSON.parse(
  readFileSync(join(here, 'conversations.json'), 'utf8')
)

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
}

type StepStat = { pass: boolean; controlConfirmed: boolean | null }

async function main(): Promise<void> {
  const model = process.env.SIBYL_CHAT_MODEL || 'qwen2.5-coder'
  console.log(`\nSibyl multi-turn eval — model: ${model}\n`)

  const ddl = await loadSchema()
  const stats: StepStat[] = []
  let convosPassed = 0
  const weakRows: string[] = []

  for (const convo of conversations) {
    console.log(`  ${convo.id}`)
    const history: Turn[] = []
    let allStepsPass = true

    for (let i = 0; i < convo.steps.length; i++) {
      const step = convo.steps[i]

      // Self-threaded run: generate with the model's own prior SQL as history.
      const r = await generateAndRun(ddl, step.question, history)
      const gold = await runGold(step.goldSQL)

      let pass = false
      let sql: string | null = null
      let detail = ''
      if (r.kind === 'refused') {
        detail = 'unexpected refusal'
      } else if (r.kind === 'error') {
        detail = r.error
      } else {
        pass = rowsEqual(r.rows, gold, { ordered: step.ordered })
        sql = r.sql
        detail = pass ? `${r.rows.length} rows match` : `got ${r.rows.length}, expected ${gold.length}`
      }

      // No-history control (referential steps only).
      let controlConfirmed: boolean | null = null
      if (step.referential) {
        const ctrl = await generateAndRun(ddl, step.question, [])
        const ctrlMatches = ctrl.kind === 'rows' && rowsEqual(ctrl.rows, gold, { ordered: step.ordered })
        controlConfirmed = !ctrlMatches // memory made the difference
        if (ctrlMatches) weakRows.push(`${convo.id} step ${i + 1}`)
      }

      stats.push({ pass, controlConfirmed })
      if (!pass) allStepsPass = false

      const mark = pass ? c.green('✓') : c.red('✗')
      const refTag = step.referential
        ? controlConfirmed
          ? c.dim(' · memory confirmed')
          : c.yellow(' · CONTROL ALSO PASSED (weak referential)')
        : ''
      console.log(`    ${mark}  ${step.question}${refTag}`)
      if (!pass) console.log(c.dim(`         ${detail}`))

      // Self-thread: only a successful turn's SQL graduates into history.
      if (sql) history.push({ question: step.question, sql })
    }

    if (allStepsPass) convosPassed++
    console.log()
  }

  const stepsPassed = stats.filter((s) => s.pass).length
  const totalSteps = stats.length
  const totalConvos = conversations.length
  const refStats = stats.filter((s) => s.controlConfirmed !== null)
  const controlsConfirmed = refStats.filter((s) => s.controlConfirmed).length

  const pct = (n: number, d: number) => ((n / d) * 100).toFixed(0)
  console.log(`  Per-step:         ${stepsPassed}/${totalSteps} (${pct(stepsPassed, totalSteps)}%)`)
  console.log(`  Per-conversation: ${convosPassed}/${totalConvos} (${pct(convosPassed, totalConvos)}%)`)
  console.log(`  Memory controls:  ${controlsConfirmed}/${refStats.length} referential steps confirmed history-dependent`)
  if (weakRows.length) {
    console.log(c.yellow(`  ⚠  weak referential rows (passed without history): ${weakRows.join(', ')}`))
  }
  console.log()

  await close()
  // Gate: every step correct AND every referential step genuinely history-dependent.
  const ok = stepsPassed === totalSteps && controlsConfirmed === refStats.length
  process.exit(ok ? 0 : 1)
}

await main()
