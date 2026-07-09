// First-run wizard: when Sibyl launches with no DATABASE_URL, walk the user through
// pointing it at a Postgres database instead of crashing. Validates the URL by
// actually connecting and counting tables, then offers to persist it to .env.
//
// The pure pieces (classifyConnError, upsertEnvDatabaseUrl) carry the real logic and
// are unit-tested; the interactive shell around them stays thin.

import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { readFileSync, writeFileSync } from 'node:fs'
import { probeConnection } from './db.ts'
import { c } from './colors.ts'

const DEFAULT_LOCAL_URL = 'postgresql://localhost:5432/postgres'
const ENV_PATH = '.env'

// Turn a raw pg/driver error into a one-line, actionable hint. Pure — matched on the
// substrings pg surfaces for the common first-run failures.
export function classifyConnError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('getaddrinfo') || m.includes('enotfound'))
    return 'Host not found — double-check the hostname in the URL.'
  if (m.includes('econnrefused'))
    return 'Connection refused — is Postgres running and is the port right?'
  if (m.includes('etimedout') || m.includes('timeout'))
    return 'Timed out — check the host/port and that the database accepts remote connections.'
  if (m.includes('password authentication failed') || m.includes('sasl') || m.includes('no password'))
    return 'Authentication failed — check the username and password.'
  if (m.includes('does not exist') && m.includes('database'))
    return "That database doesn't exist — check the db name at the end of the URL."
  if (m.includes('ssl') || m.includes('certificate') || m.includes('self-signed'))
    return 'SSL problem — try adding ?sslmode=require, or verify the server certificate.'
  return message
}

// Return new .env contents with DATABASE_URL set to `url`: replace an existing
// (possibly empty) DATABASE_URL line in place, else append one. Preserves every
// other line. Pure — the caller handles reading/writing the file. `existing` is
// null when there is no .env yet.
export function upsertEnvDatabaseUrl(existing: string | null, url: string): string {
  const line = `DATABASE_URL=${url}`
  if (existing === null || existing.trim() === '') {
    return `# Created by Sibyl's first-run setup. Connect as a READ-ONLY role (see SETUP.md).\n${line}\n`
  }
  // Function replacers so a `$` in the URL (valid in a password) is inserted
  // literally rather than interpreted as a replacement pattern.
  if (/^DATABASE_URL=.*$/m.test(existing)) {
    return existing.replace(/^DATABASE_URL=.*$/m, () => line)
  }
  return existing.replace(/\n?$/, () => `\n${line}\n`)
}

function readEnv(): string | null {
  try {
    return readFileSync(ENV_PATH, 'utf8')
  } catch {
    return null
  }
}

// Interactive entry. Returns true once DATABASE_URL is configured in the process
// env (so the caller can proceed to boot), false if the user aborted or we can't
// prompt (non-TTY). Only ever called when nothing is configured.
export async function runFirstRunWizard(): Promise<boolean> {
  if (!input.isTTY) {
    console.log(
      c.red('  No DATABASE_URL configured.') +
        ' Set it in .env (see SETUP.md) or pass --db <url>.',
    )
    return false
  }

  console.log()
  console.log(c.bold('  No database configured. Let’s set one up.'))
  console.log(c.dim('  Enter a Postgres URL — ideally a read-only role (see SETUP.md).'))
  console.log(c.dim('  Press Enter to try a local database, or Ctrl-C to quit.\n'))

  const rl = readline.createInterface({ input, output })
  try {
    while (true) {
      let answer: string
      try {
        answer = (await rl.question(`  ${c.cyan('Connection URL')} ${c.dim(`[${DEFAULT_LOCAL_URL}]`)}: `)).trim()
      } catch {
        return false // Ctrl-C / Ctrl-D
      }
      const url = answer || DEFAULT_LOCAL_URL

      try {
        new URL(url)
      } catch {
        console.log(c.red(`  ✗  That doesn't look like a URL. Try postgresql://user:pass@host:5432/db\n`))
        continue
      }

      process.stdout.write(c.dim('  Connecting…'))
      const result = await probeConnection(url)
      process.stdout.write('\r' + ' '.repeat(16) + '\r')

      if (!result.ok) {
        console.log(c.red('  ✗  ') + classifyConnError(result.error) + '\n')
        continue
      }

      console.log(
        c.green('  ✓') +
          ` Connected. Found ${result.tableCount} table${result.tableCount === 1 ? '' : 's'}.`,
      )
      process.env.DATABASE_URL = url

      let save: string
      try {
        save = (await rl.question(`  Save to ${ENV_PATH}? ${c.dim('[Y/n]')} `)).trim().toLowerCase()
      } catch {
        save = 'n'
      }
      if (save === '' || save === 'y' || save === 'yes') {
        try {
          writeFileSync(ENV_PATH, upsertEnvDatabaseUrl(readEnv(), url))
          console.log(c.green('  ✓') + ` Saved to ${ENV_PATH}.\n`)
        } catch (e) {
          console.log(c.yellow('  ⚠  Couldn’t write ') + ENV_PATH + `: ${(e as Error).message}`)
          console.log(c.dim('     Using it for this session only.\n'))
        }
      } else {
        console.log(c.dim('  Not saved — using it for this session only.\n'))
      }
      return true
    }
  } finally {
    rl.close()
  }
}
