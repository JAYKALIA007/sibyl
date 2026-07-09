import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyConnError, upsertEnvDatabaseUrl } from './setup.ts'

// ── classifyConnError ────────────────────────────────────────────────────────────

test('maps a DNS failure to a host hint', () => {
  assert.match(classifyConnError('getaddrinfo ENOTFOUND db.nope.supabase.co'), /Host not found/)
})

test('maps a refused connection to a port/running hint', () => {
  assert.match(classifyConnError('connect ECONNREFUSED 127.0.0.1:5432'), /Connection refused/)
})

test('maps an auth failure to a credentials hint', () => {
  assert.match(
    classifyConnError('password authentication failed for user "sibyl_ro"'),
    /Authentication failed/,
  )
})

test('maps a missing database to a db-name hint', () => {
  assert.match(classifyConnError('database "sibyl" does not exist'), /database doesn't exist/)
})

test('maps an SSL error to an SSL hint', () => {
  assert.match(classifyConnError('self-signed certificate in certificate chain'), /SSL problem/)
})

test('maps a timeout to a host/port hint', () => {
  assert.match(classifyConnError('Connection terminated due to connection timeout'), /Timed out/)
})

test('passes an unrecognized error through unchanged', () => {
  assert.equal(classifyConnError('some novel driver error'), 'some novel driver error')
})

// ── upsertEnvDatabaseUrl ─────────────────────────────────────────────────────────

const URL_A = 'postgresql://u:p@host:5432/db'

test('creates a fresh .env with a header when none exists', () => {
  const out = upsertEnvDatabaseUrl(null, URL_A)
  assert.match(out, /^# Created by Sibyl/)
  assert.match(out, /^DATABASE_URL=postgresql:\/\/u:p@host:5432\/db$/m)
  assert.ok(out.endsWith('\n'))
})

test('treats a whitespace-only file like an empty one', () => {
  const out = upsertEnvDatabaseUrl('   \n', URL_A)
  assert.match(out, /^# Created by Sibyl/)
})

test('replaces an empty DATABASE_URL line in place, keeping other lines', () => {
  const out = upsertEnvDatabaseUrl('FOO=1\nDATABASE_URL=\nBAR=2\n', URL_A)
  assert.equal(out, `FOO=1\nDATABASE_URL=${URL_A}\nBAR=2\n`)
})

test('overwrites an existing DATABASE_URL value', () => {
  const out = upsertEnvDatabaseUrl('DATABASE_URL=postgresql://old@h/db\n', URL_A)
  assert.equal(out, `DATABASE_URL=${URL_A}\n`)
})

test('appends when the file has no DATABASE_URL line', () => {
  const out = upsertEnvDatabaseUrl('SIBYL_NUM_CTX=8192\n', URL_A)
  assert.equal(out, `SIBYL_NUM_CTX=8192\nDATABASE_URL=${URL_A}\n`)
})

test('appends when the only reference is a comment, not a real setting', () => {
  const out = upsertEnvDatabaseUrl('# DATABASE_URL=example\n', URL_A)
  assert.equal(out, `# DATABASE_URL=example\nDATABASE_URL=${URL_A}\n`)
})

test('appends cleanly when the file lacks a trailing newline', () => {
  const out = upsertEnvDatabaseUrl('FOO=1', URL_A)
  assert.equal(out, `FOO=1\nDATABASE_URL=${URL_A}\n`)
})

test('inserts a URL containing $ literally (password edge case)', () => {
  const withDollar = 'postgresql://u:pa$$w0rd@host:5432/db'
  const out = upsertEnvDatabaseUrl('DATABASE_URL=old\n', withDollar)
  assert.equal(out, `DATABASE_URL=${withDollar}\n`)
})
