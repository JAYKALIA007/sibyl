import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guard } from './guard.ts'

test('passes a plain SELECT and injects a default LIMIT', () => {
  const r = guard('SELECT * FROM users')
  assert.equal(r.ok, true)
  assert.match((r as { sql: string }).sql, /LIMIT 500$/)
})

test('leaves an existing LIMIT alone (no double LIMIT)', () => {
  const r = guard('SELECT * FROM users LIMIT 10')
  assert.equal(r.ok, true)
  const sql = (r as { sql: string }).sql
  assert.match(sql, /LIMIT 10/)
  assert.equal(sql.match(/limit/gi)?.length, 1)
})

test('allows a CTE (WITH ... SELECT)', () => {
  const r = guard('WITH t AS (SELECT id FROM users) SELECT * FROM t')
  assert.equal(r.ok, true)
})

test('rejects a data-modifying CTE (WITH ... DELETE)', () => {
  const r = guard('WITH t AS (SELECT id FROM users) DELETE FROM orders WHERE user_id IN (SELECT id FROM t)')
  assert.equal(r.ok, false)
})

for (const write of [
  'INSERT INTO users (name) VALUES (\'x\')',
  'UPDATE users SET name = \'x\'',
  'DELETE FROM orders',
  'DROP TABLE users',
  'ALTER TABLE users ADD COLUMN x int',
  'TRUNCATE users',
]) {
  test(`rejects non-SELECT: ${write.split(' ')[0]}`, () => {
    const r = guard(write)
    assert.equal(r.ok, false)
  })
}

test('rejects multiple statements', () => {
  const r = guard('SELECT 1; SELECT 2')
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /multiple statements/)
})

test('a semicolon inside a string literal is not a second statement', () => {
  const r = guard("SELECT ';' AS semi, name FROM users")
  assert.equal(r.ok, true)
})

test('the word "delete" inside a string literal does not trigger rejection', () => {
  const r = guard("SELECT * FROM orders WHERE status = 'delete me'")
  assert.equal(r.ok, true)
})

test('rejects empty / whitespace-only input', () => {
  assert.equal(guard('').ok, false)
  assert.equal(guard('   \n  ').ok, false)
})

test('handles a trailing semicolon on a single statement', () => {
  const r = guard('SELECT * FROM users;')
  assert.equal(r.ok, true)
  const sql = (r as { sql: string }).sql
  assert.doesNotMatch(sql, /;/)
  assert.match(sql, /LIMIT 500$/)
})

test('ignores a LIMIT that only appears in a comment (still injects)', () => {
  const r = guard('SELECT * FROM users -- no LIMIT here')
  assert.equal(r.ok, true)
  assert.match((r as { sql: string }).sql, /LIMIT 500$/)
})
