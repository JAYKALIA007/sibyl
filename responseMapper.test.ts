import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapResult, mapFault } from './responseMapper.ts'
import type { AskResult } from './core.ts'

test('an answer maps to 200', () => {
  const r: AskResult = {
    kind: 'answer',
    sql: 'SELECT 1',
    rows: [{ n: 1 }],
    columns: ['n'],
    summary: 'one',
    attempts: 1,
    usage: { promptTokens: 10, outputTokens: 2, numCtx: 8192 },
  }
  assert.deepEqual(mapResult(r), { status: 200, body: r })
})

test('a refusal maps to 200 (it is a valid result, not a failure)', () => {
  const r: AskResult = { kind: 'refused', reason: 'off schema' }
  assert.equal(mapResult(r).status, 200)
})

test('an after-retries error maps to 200, NOT 5xx', () => {
  const r: AskResult = { kind: 'error', sql: 'SELECT bad', error: 'syntax', attempts: 3 }
  // The key rule: a query the model couldn't fix is a message, not an outage.
  assert.equal(mapResult(r).status, 200)
})

test('a thrown Error maps to 503 with its message', () => {
  const res = mapFault(new Error('ECONNREFUSED ollama'))
  assert.equal(res.status, 503)
  assert.deepEqual(res.body, { kind: 'fault', error: 'ECONNREFUSED ollama' })
})

test('a non-Error fault is stringified', () => {
  const res = mapFault('db pool dead')
  assert.equal(res.status, 503)
  assert.deepEqual(res.body, { kind: 'fault', error: 'db pool dead' })
})
