import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withAdded, withRenamed, withRemoved } from './connectionState.ts'
import type { ConnectionView } from './types.ts'

const conns: ConnectionView[] = [
  { id: 'a', name: 'A', label: 'u@h/a' },
  { id: 'b', name: 'B', label: 'u@h/b' },
  { id: 'c', name: 'C', label: 'u@h/c' },
]

test('withAdded appends without mutating the input', () => {
  const next = withAdded(conns, { id: 'd', name: 'D', label: 'u@h/d' })
  assert.deepEqual(next.map((c) => c.id), ['a', 'b', 'c', 'd'])
  assert.equal(conns.length, 3) // original untouched
})

test('withRenamed replaces only the matching connection', () => {
  const next = withRenamed(conns, { id: 'b', name: 'B2', label: 'u@h/b' })
  assert.equal(next.find((c) => c.id === 'b')?.name, 'B2')
  assert.equal(next.find((c) => c.id === 'a')?.name, 'A')
})

test('removing a background connection leaves the active one unchanged', () => {
  const r = withRemoved(conns, 'c', 'a')
  assert.deepEqual(r.connections.map((c) => c.id), ['a', 'b'])
  assert.equal(r.activeId, 'a')
})

test('removing the active connection falls to the first remaining', () => {
  const r = withRemoved(conns, 'a', 'a')
  assert.deepEqual(r.connections.map((c) => c.id), ['b', 'c'])
  assert.equal(r.activeId, 'b')
})

test('removing the last connection empties the registry and clears active', () => {
  const one: ConnectionView[] = [{ id: 'a', name: 'A', label: 'u@h/a' }]
  const r = withRemoved(one, 'a', 'a')
  assert.deepEqual(r.connections, [])
  assert.equal(r.activeId, null)
})
