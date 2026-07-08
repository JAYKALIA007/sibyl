// Interactive REPL — type a question, get SQL + a result table + a plain-English
// summary. Ctrl-C or type 'exit' / 'quit' to leave. '.schema' reloads and prints
// the current DDL. '.clear' wipes the terminal.

import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { ask, loadSchema } from './core.ts'
import { close } from './db.ts'

// ── table rendering ──────────────────────────────────────────────────────────

function renderTable(columns: string[], rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '  (no rows)'

  const widths = columns.map((col) => {
    const valWidth = Math.max(...rows.map((r) => String(r[col] ?? '').length))
    return Math.max(col.length, valWidth)
  })

  const sep = '┼' + widths.map((w) => '─'.repeat(w + 2)).join('┼') + '┼'
  const topBorder = '┌' + widths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐'
  const botBorder = '└' + widths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘'

  const headerCells = columns.map((c, i) => ` ${c.padEnd(widths[i])} `).join('│')
  const header = `│${headerCells}│`

  const dataRows = rows.map((r) => {
    const cells = columns.map((c, i) => ` ${String(r[c] ?? '').padEnd(widths[i])} `).join('│')
    return `│${cells}│`
  })

  return [topBorder, header, sep, ...dataRows, botBorder].join('\n')
}

// ── colours (only when stdout is a TTY) ─────────────────────────────────────

const isTTY = output.isTTY
const c = {
  bold: (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  cyan: (s: string) => (isTTY ? `\x1b[36m${s}\x1b[0m` : s),
  green: (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s: string) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  magenta: (s: string) => (isTTY ? `\x1b[35m${s}\x1b[0m` : s),
}

// ── boot ─────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  console.log()
  console.log(c.bold(c.cyan('  Sibyl — ask your database in plain English')))
  console.log(c.dim('  Type a question, .schema to inspect, or exit / Ctrl-C to quit.\n'))

  process.stdout.write(c.dim('  Loading schema…'))
  const ddl = await loadSchema()
  const tableCount = (ddl.match(/^CREATE TABLE/gm) ?? []).length
  process.stdout.write(`\r  ${c.green('✓')} Schema loaded — ${tableCount} table${tableCount === 1 ? '' : 's'} in scope.\n\n`)
}

// ── REPL ─────────────────────────────────────────────────────────────────────

async function repl(): Promise<void> {
  const rl = readline.createInterface({ input, output, terminal: isTTY })

  const prompt = c.bold(c.magenta('sibyl> '))

  while (true) {
    let question: string
    try {
      question = (await rl.question(prompt)).trim()
    } catch {
      break // Ctrl-D / EOF
    }
    if (rl.closed) break

    if (!question) continue

    // ── built-in commands ────────────────────────────────────────────────────
    if (question === 'exit' || question === 'quit') {
      break
    }

    if (question === '.clear') {
      process.stdout.write('\x1bc')
      continue
    }

    if (question === '.schema') {
      const ddl = await loadSchema(true)
      console.log('\n' + c.dim(ddl) + '\n')
      continue
    }

    // ── NL → SQL → run ───────────────────────────────────────────────────────
    const t0 = Date.now()
    process.stdout.write(c.dim('  thinking…'))

    const result = await ask(question)
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

    process.stdout.write('\r' + ' '.repeat(14) + '\r') // erase the "thinking…" line

    if (result.kind === 'refused') {
      console.log(c.yellow(`  ⚠  ${result.reason}\n`))
      continue
    }

    if (result.kind === 'error') {
      console.log(c.red(`  ✗  Failed after ${result.attempts} attempt${result.attempts === 1 ? '' : 's'}.`))
      console.log(c.dim(`     Last error: ${result.error}\n`))
      continue
    }

    // answer ─────────────────────────────────────────────────────────────────
    const retryNote =
      result.attempts > 1 ? c.dim(` (${result.attempts} attempts)`) : ''

    console.log()
    console.log(c.dim(`  SQL: ${result.sql.replace(/\s+/g, ' ')}`) + retryNote)
    console.log()
    console.log(renderTable(result.columns, result.rows).replace(/^/gm, '  '))
    console.log()
    console.log(c.green(`  ✓`) + c.bold(` ${result.summary}`) + c.dim(` (${elapsed}s, ${result.rows.length} row${result.rows.length === 1 ? '' : 's'})`))
    console.log()
  }
}

// ── entry ─────────────────────────────────────────────────────────────────────

await boot()
await repl()
console.log(c.dim('  bye.'))
await close()
