import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCsv } from './csv.ts'

test('serializes a simple grid with a header row', () => {
  const csv = toCsv(['name', 'count'], [
    { name: 'Alice', count: 3 },
    { name: 'Bob', count: 2 },
  ])
  assert.equal(csv, 'name,count\nAlice,3\nBob,2')
})

test('quotes fields containing commas, quotes, and newlines', () => {
  const csv = toCsv(['label'], [
    { label: 'a,b' },
    { label: 'say "hi"' },
    { label: 'line1\nline2' },
  ])
  assert.equal(csv, 'label\n"a,b"\n"say ""hi"""\n"line1\nline2"')
})

test('renders null and undefined as empty fields', () => {
  const csv = toCsv(['a', 'b'], [{ a: null, b: undefined }])
  assert.equal(csv, 'a,b\n,')
})

test('stringifies object cells as JSON', () => {
  const csv = toCsv(['meta'], [{ meta: { x: 1 } }])
  assert.equal(csv, 'meta\n"{""x"":1}"')
})

test('emits a header-only file for zero rows', () => {
  assert.equal(toCsv(['a', 'b'], []), 'a,b')
})
