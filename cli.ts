// Interactive REPL — type a question, get SQL + a result table + a plain-English
// summary. Ctrl-C or 'exit' to quit. Built-in commands: .help .schema .tables .clear

import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ask, loadSchema, type Turn } from './core.ts'
import { runQuery, close } from './db.ts'
import { runFirstRunWizard, ensureOllamaReady } from './setup.ts'
import { c } from './colors.ts'

// How many prior turns of context to carry (see docs/adr/0001).
const HISTORY_WINDOW = 3

// Persistent line history — arrow-up recalls questions from past sessions too.
const HISTORY_FILE = join(homedir(), '.sibyl_history')
const HISTORY_MAX = 500

// ── CLI flags ──────────────────────────────────────────────────────────────────
// --db <url> overrides DATABASE_URL for this run without editing .env. Applied
// before anything touches the (lazy) pool, so the override is in place on connect.
function applyDbFlag(): void {
  const i = process.argv.indexOf('--db')
  if (i === -1) return
  const url = process.argv[i + 1]
  if (!url || url.startsWith('--')) {
    console.error('  --db requires a connection URL, e.g. --db postgresql://user:pass@host:5432/db')
    process.exit(1)
  }
  try {
    new URL(url)
  } catch {
    console.error(`  --db: not a valid URL: ${url}`)
    process.exit(1)
  }
  process.env.DATABASE_URL = url
}

// ── persistent history helpers ──────────────────────────────────────────────────
function loadPersistedHistory(): string[] {
  try {
    return readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean)
  } catch {
    return [] // no file yet, or unreadable — start empty
  }
}

function persistQuestion(list: string[], question: string): void {
  list.push(question)
  if (list.length > HISTORY_MAX) list.splice(0, list.length - HISTORY_MAX)
  try {
    writeFileSync(HISTORY_FILE, list.join('\n') + '\n')
  } catch {
    // best-effort; a read-only HOME shouldn't crash the REPL
  }
}

// ── CSV export helpers ──────────────────────────────────────────────────────────
function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const head = columns.map(csvEscape).join(',')
  const body = rows.map((r) => columns.map((col) => csvEscape(r[col])).join(',')).join('\n')
  return `${head}\n${body}\n`
}

// ── spinner ───────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function startSpinner(text: string): () => void {
  if (!output.isTTY) {
    process.stdout.write(`  ${text}`)
    return () => process.stdout.write('\r' + ' '.repeat(text.length + 4) + '\r')
  }
  let i = 0
  const id = setInterval(() => {
    process.stdout.write(`\r  ${c.cyan(SPINNER_FRAMES[i++ % SPINNER_FRAMES.length])} ${c.dim(text)}`)
  }, 80)
  return () => {
    clearInterval(id)
    process.stdout.write('\r' + ' '.repeat(text.length + 6) + '\r')
  }
}

// ── table rendering ──────────────────────────────────────────────────────────

const DISPLAY_ROW_CAP = 20

function renderTable(columns: string[], rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '  (no rows)'

  const display = rows.slice(0, DISPLAY_ROW_CAP)
  const widths = columns.map((col) => {
    const valWidth = Math.max(...display.map((r) => String(r[col] ?? '').length))
    return Math.max(col.length, valWidth)
  })

  const sep       = '┼' + widths.map((w) => '─'.repeat(w + 2)).join('┼') + '┼'
  const topBorder = '┌' + widths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐'
  const botBorder = '└' + widths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘'
  const headerRow = `│${columns.map((col, i) => ` ${col.padEnd(widths[i])} `).join('│')}│`
  const dataRows  = display.map(
    (r) => `│${columns.map((col, i) => ` ${String(r[col] ?? '').padEnd(widths[i])} `).join('│')}│`
  )

  const lines = [topBorder, headerRow, sep, ...dataRows, botBorder]
  if (rows.length > DISPLAY_ROW_CAP) {
    lines.push(c.dim(`  … and ${rows.length - DISPLAY_ROW_CAP} more rows`))
  }
  return lines.join('\n')
}

// ── token meter ────────────────────────────────────────────────────────────────
// Real counts from Ollama. Shows how full the context window is — the signal that
// tells you when the schema has outgrown "whole schema in the prompt" (→ schema-RAG).

function formatMeter(usage: { promptTokens?: number; outputTokens?: number; numCtx: number }): string {
  const n = (x: number) => x.toLocaleString('en-US')
  if (usage.promptTokens === undefined) {
    return c.dim(`  ctx ?/${n(usage.numCtx)} (Ollama didn't report token counts)`)
  }
  const pct = Math.round((usage.promptTokens / usage.numCtx) * 100)
  const out = usage.outputTokens ?? 0
  return c.dim(`  ctx ${n(usage.promptTokens)} / ${n(usage.numCtx)} (${pct}%)  ·  out ${n(out)}`)
}

// ── connection info ───────────────────────────────────────────────────────────

function parseConnInfo(raw: string): string {
  try {
    const u = new URL(raw.replace(/\?.*$/, ''))   // strip query params before parse
    const host = u.hostname
    const db   = u.pathname.replace(/^\//, '') || 'postgres'
    const user = u.username
    return `${c.dim(user + '@' + host + '/' + db)}`
  } catch {
    return ''
  }
}

// ── .help ─────────────────────────────────────────────────────────────────────

const HELP = `
  ${c.bold('Commands')}
  ${c.cyan('.help')}            show this message
  ${c.cyan('.schema')}          print the full DDL Sibyl is working from
  ${c.cyan('.tables')}          list tables with row counts
  ${c.cyan('.last')}            re-print the last generated SQL
  ${c.cyan('.export')} [file]   save the last result to CSV
  ${c.cyan('.clear')}           clear the terminal and reset conversation memory
  ${c.cyan('exit')}             quit  (also Ctrl-C / Ctrl-D)

  ${c.bold('Anything else')} is treated as a natural-language question.
  Follow-ups remember the last ${HISTORY_WINDOW} turns — ask "how many did they order?"
  ${c.dim('Launch with --db <url> to point at another database for one run.')}
`

// ── boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  console.log()
  console.log(c.bold(c.cyan('  Sibyl')) + c.dim(' — ask your database in plain English'))

  const connInfo = parseConnInfo(process.env.DATABASE_URL ?? '')
  if (connInfo) console.log(`  ${connInfo}`)

  console.log(c.dim('  Type a question or .help for commands.\n'))

  const stopSpinner = startSpinner('Connecting and loading schema…')
  const ddl = await loadSchema()
  stopSpinner()

  const tableCount = (ddl.match(/^CREATE TABLE/gm) ?? []).length
  console.log(`  ${c.green('✓')} ${tableCount} table${tableCount === 1 ? '' : 's'} in scope.\n`)
}

// ── REPL ──────────────────────────────────────────────────────────────────────

async function repl(): Promise<void> {
  const rl = readline.createInterface({ input, output, terminal: output.isTTY })
  const prompt = c.bold(c.magenta('sibyl> '))

  // Preload persisted line history so arrow-up recalls past sessions. readline's
  // in-memory history is most-recent-first, the file is oldest-first.
  const persisted = loadPersistedHistory()
  if (persisted.length) (rl as unknown as { history: string[] }).history = [...persisted].reverse()

  // The CLI owns the conversation buffer; the core stays stateless (ADR 0001).
  let history: Turn[] = []

  // For .last / .export — the most recent successful query and its result.
  let lastSql: string | null = null
  let lastResult: { columns: string[]; rows: Record<string, unknown>[] } | null = null

  while (true) {
    let question: string
    try {
      question = (await rl.question(prompt)).trim()
    } catch {
      break
    }
    if (rl.closed) break
    if (!question) continue

    // ── built-in commands ─────────────────────────────────────────────────────
    if (question === 'exit' || question === 'quit') {
      rl.close()
      break
    }

    if (question === '.help') {
      console.log(HELP)
      continue
    }

    if (question === '.clear') {
      process.stdout.write('\x1bc')
      history = [] // same gesture wipes the screen and the conversation
      continue
    }

    if (question === '.last') {
      console.log('\n' + (lastSql ? c.dim(lastSql) : c.dim('(no previous query)')) + '\n')
      continue
    }

    if (question === '.export' || question.startsWith('.export ')) {
      if (!lastResult) {
        console.log(c.dim('  (no result to export)\n'))
        continue
      }
      const arg = question.slice('.export'.length).trim()
      const file = arg || `sibyl-export-${Date.now()}.csv`
      try {
        writeFileSync(file, toCsv(lastResult.columns, lastResult.rows))
        console.log(c.green(`  ✓`) + ` saved ${lastResult.rows.length} row${lastResult.rows.length === 1 ? '' : 's'} to ${file}\n`)
      } catch (e) {
        console.log(c.red(`  ✗  could not write ${file}: ${(e as Error).message}\n`))
      }
      continue
    }

    if (question === '.schema') {
      const stopSpinner = startSpinner('Reloading schema…')
      const ddl = await loadSchema(true)
      stopSpinner()
      console.log('\n' + c.dim(ddl) + '\n')
      continue
    }

    if (question === '.tables') {
      const stopSpinner = startSpinner('Fetching table sizes…')
      const res = await runQuery(`
        SELECT relname AS table,
          CASE WHEN n_live_tup = 0 THEN '?' ELSE n_live_tup::text END AS rows
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY relname`)
      stopSpinner()
      if ('error' in res) {
        console.log(c.red(`  ✗  ${res.error}\n`))
      } else {
        console.log()
        console.log(renderTable(res.columns, res.rows).replace(/^/gm, '  '))
        console.log()
      }
      continue
    }

    // ── NL → SQL → run ────────────────────────────────────────────────────────
    const t0 = Date.now()
    const stopSpinner = startSpinner('Thinking…')
    const result = await ask(question, history)
    stopSpinner()
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

    if (result.kind === 'refused') {
      console.log(c.yellow(`  ⚠  ${result.reason}\n`))
      continue
    }

    if (result.kind === 'error') {
      console.log(c.red(`  ✗  Failed after ${result.attempts} attempt${result.attempts === 1 ? '' : 's'}.`))
      console.log(c.dim(`     Last error: ${result.error}\n`))
      continue
    }

    const retryNote = result.attempts > 1 ? c.dim(` (${result.attempts} attempts)`) : ''

    console.log()
    console.log(c.dim(`  SQL: ${result.sql.replace(/\s+/g, ' ')}`) + retryNote)
    console.log()
    console.log(renderTable(result.columns, result.rows).replace(/^/gm, '  '))
    console.log()
    console.log(
      c.green('  ✓') +
      c.bold(` ${result.summary}`) +
      c.dim(` (${elapsed}s, ${result.rows.length} row${result.rows.length === 1 ? '' : 's'})`)
    )
    console.log(formatMeter(result.usage))
    console.log()

    // Remember for .last / .export, and persist the question for cross-session recall.
    lastSql = result.sql
    lastResult = { columns: result.columns, rows: result.rows }
    persistQuestion(persisted, question)

    // Only successful turns graduate into history (ADR 0001); keep the last N.
    history = [...history, { question, sql: result.sql }].slice(-HISTORY_WINDOW)
  }
}

// ── entry ─────────────────────────────────────────────────────────────────────

applyDbFlag()

// Zero-config first run: if nothing configured the connection (no .env, empty
// DATABASE_URL, no --db), walk the user through it instead of crashing on connect.
if (!process.env.DATABASE_URL) {
  const configured = await runFirstRunWizard()
  if (!configured) process.exit(1)
}

// The other hard dependency: a local LLM via Ollama. Fail early with the exact fix
// (and an offer to pull the model) instead of a raw fetch error on the first question.
if (!(await ensureOllamaReady())) process.exit(1)

await boot()
await repl()
console.log(c.dim('  bye.'))
await close()
process.exit(0)
