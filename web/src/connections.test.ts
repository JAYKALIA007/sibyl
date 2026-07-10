import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveActiveConnection } from './connections.ts'

const conns = [
  { id: 'a', name: 'A', label: 'u@h/a' },
  { id: 'b', name: 'B', label: 'u@h/b' },
]

test('empty registry resolves to null', () => {
  assert.equal(resolveActiveConnection('a', []), null)
  assert.equal(resolveActiveConnection(null, []), null)
})

test('a valid stored id is kept', () => {
  assert.equal(resolveActiveConnection('b', conns), 'b')
})

test('a stale or missing stored id falls back to the first connection', () => {
  assert.equal(resolveActiveConnection('gone', conns), 'a')
  assert.equal(resolveActiveConnection(null, conns), 'a')
})
