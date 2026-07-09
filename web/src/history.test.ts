import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveHistory, type HistoryMessage } from './history'
import type { AskResult } from './types'

function answer(sql: string): AskResult {
  return { kind: 'answer', sql, rows: [], columns: [], summary: '', attempts: 1, usage: { numCtx: 8192 } }
}
const refused: AskResult = { kind: 'refused', reason: 'off schema' }
const errored: AskResult = { kind: 'error', sql: 'SELECT bad', error: 'x', attempts: 3 }

test('empty conversation yields no history', () => {
  assert.deepEqual(deriveHistory([]), [])
})

test('pairs a question with the SQL of its successful answer', () => {
  const msgs: HistoryMessage[] = [
    { role: 'user', text: 'which users are from the USA?' },
    { role: 'assistant', result: answer("SELECT * FROM users WHERE country='USA'") },
  ]
  assert.deepEqual(deriveHistory(msgs), [
    { question: 'which users are from the USA?', sql: "SELECT * FROM users WHERE country='USA'" },
  ])
})

test('refusals never enter the buffer', () => {
  const msgs: HistoryMessage[] = [
    { role: 'user', text: 'who is the CEO of Google?' },
    { role: 'assistant', result: refused },
  ]
  assert.deepEqual(deriveHistory(msgs), [])
})

test('errors never enter the buffer', () => {
  const msgs: HistoryMessage[] = [
    { role: 'user', text: 'do something impossible' },
    { role: 'assistant', result: errored },
  ]
  assert.deepEqual(deriveHistory(msgs), [])
})

test('a faulted turn (null result) never enters the buffer', () => {
  const msgs: HistoryMessage[] = [
    { role: 'user', text: 'q' },
    { role: 'assistant', result: null },
  ]
  assert.deepEqual(deriveHistory(msgs), [])
})

test('the trailing (current, unanswered) question is excluded', () => {
  const msgs: HistoryMessage[] = [
    { role: 'user', text: 'q1' },
    { role: 'assistant', result: answer('S1') },
    { role: 'user', text: 'q2 (current, not answered yet)' },
  ]
  assert.deepEqual(deriveHistory(msgs), [{ question: 'q1', sql: 'S1' }])
})

test('caps at the window (last 3 of 4 answered turns)', () => {
  const msgs: HistoryMessage[] = []
  for (let i = 1; i <= 4; i++) {
    msgs.push({ role: 'user', text: `q${i}` })
    msgs.push({ role: 'assistant', result: answer(`S${i}`) })
  }
  assert.deepEqual(deriveHistory(msgs), [
    { question: 'q2', sql: 'S2' },
    { question: 'q3', sql: 'S3' },
    { question: 'q4', sql: 'S4' },
  ])
})

test('a refusal in the middle does not shift pairings', () => {
  const msgs: HistoryMessage[] = [
    { role: 'user', text: 'q1' },
    { role: 'assistant', result: answer('S1') },
    { role: 'user', text: 'q2' },
    { role: 'assistant', result: refused },
    { role: 'user', text: 'q3' },
    { role: 'assistant', result: answer('S3') },
  ]
  assert.deepEqual(deriveHistory(msgs), [
    { question: 'q1', sql: 'S1' },
    { question: 'q3', sql: 'S3' },
  ])
})
