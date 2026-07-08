// Interactive REPL — type a question, get SQL + a result table + a plain-English
// summary. Ctrl-C or 'exit' to quit. Built-in commands: .help .schema .tables .clear

import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { ask, loadSchema } from './core.ts'
import { runQuery, close } from './db.ts'

// ── colour / NO_COLOR support ────────────────────────────────────────────────
// Respects the NO_COLOR env var (https://no-color.org/) and --no-color flag.

const useColor =
  output.isTTY &&
  !process.env.NO_COLOR &&
  !process.argv.includes('--no-color')

const c = {
  bold:    (s: string) => useColor ? `\x1b[1m${s}\x1b[0m` : s,
  dim:     (s: string) => useColor ? `\x1b[2m${s}\x1b[0m` : s,
  cyan:    (s: string) => useColor ? `\x1b[36m${s}\x1b[0m` : s,
  green:   (s: string) => useColor ? `\x1b[32m${s}\x1b[0m` : s,
  yellow:  (s: string) => useColor ? `\x1b[33m${s}\x1b[0m` : s,
  red:     (s: string) => useColor ? `\x1b[31m${s}\x1b[0m` : s,
  magenta: (s: string) => useColor ? `\x1b[35m${s}\x1b[0m` : s,
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
  ${c.cyan('.help')}      show this message
  ${c.cyan('.schema')}    print the full DDL Sibyl is working from
  ${c.cyan('.tables')}    list tables with row counts
  ${c.cyan('.clear')}     clear the terminal
  ${c.cyan('exit')}       quit  (also Ctrl-C / Ctrl-D)

  ${c.bold('Anything else')} is treated as a natural-language question.
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
    const result = await ask(question)
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
    console.log()
  }
}

// ── entry ─────────────────────────────────────────────────────────────────────

await boot()
await repl()
console.log(c.dim('  bye.'))
await close()
process.exit(0)
