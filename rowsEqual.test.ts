import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowsEqual, type Row } from './rowsEqual.ts'

test('identical rows match', () => {
  const a: Row[] = [{ id: 1, name: 'Alice' }]
  assert.equal(rowsEqual(a, [{ id: 1, name: 'Alice' }]), true)
})

test('empty results match', () => {
  assert.equal(rowsEqual([], []), true)
})

test('different row counts never match', () => {
  assert.equal(rowsEqual([{ x: 1 }], [{ x: 1 }, { x: 2 }]), false)
})

test('row order is ignored by default', () => {
  const a: Row[] = [{ n: 'Alice' }, { n: 'Bob' }]
  const b: Row[] = [{ n: 'Bob' }, { n: 'Alice' }]
  assert.equal(rowsEqual(a, b), true)
})

test('row order is respected when ordered:true', () => {
  const a: Row[] = [{ n: 'Alice' }, { n: 'Bob' }]
  const b: Row[] = [{ n: 'Bob' }, { n: 'Alice' }]
  assert.equal(rowsEqual(a, b, { ordered: true }), false)
})

test('same order passes when ordered:true', () => {
  const a: Row[] = [{ n: 'Alice' }, { n: 'Bob' }]
  assert.equal(rowsEqual(a, [{ n: 'Alice' }, { n: 'Bob' }], { ordered: true }), true)
})

test('column names are ignored (alias differences)', () => {
  const gen: Row[] = [{ count: 5 }]
  const gold: Row[] = [{ n: 5 }]
  assert.equal(rowsEqual(gen, gold), true)
})

test('column order is ignored', () => {
  const gen: Row[] = [{ name: 'Alice', orders: 3 }]
  const gold: Row[] = [{ orders: 3, name: 'Alice' }]
  assert.equal(rowsEqual(gen, gold), true)
})

test('numeric string equals number (COUNT comes back as a string)', () => {
  assert.equal(rowsEqual([{ c: '5' }], [{ c: 5 }]), true)
})

test('numeric scale is normalised (24.90 == 24.9)', () => {
  assert.equal(rowsEqual([{ price: '24.90' }], [{ price: 24.9 }]), true)
})

test('NULL and undefined collapse to the same value', () => {
  assert.equal(rowsEqual([{ body: null }], [{ body: undefined }]), true)
})

test('NULL does not equal empty string', () => {
  assert.equal(rowsEqual([{ body: null }], [{ body: '' }]), false)
})

test('non-numeric strings stay strings (ids/emails not coerced)', () => {
  assert.equal(rowsEqual([{ e: '12a' }], [{ e: 12 }]), false)
})

test('dates compare by instant regardless of representation', () => {
  const d = new Date('2026-07-09T00:00:00Z')
  assert.equal(rowsEqual([{ t: d }], [{ t: new Date(d.getTime()) }]), true)
})

test('multiset duplicates are counted, not deduped', () => {
  const a: Row[] = [{ x: 1 }, { x: 1 }, { x: 2 }]
  const b: Row[] = [{ x: 1 }, { x: 2 }, { x: 2 }]
  assert.equal(rowsEqual(a, b), false)
})

test('genuinely different values do not match', () => {
  assert.equal(rowsEqual([{ name: 'Alice' }], [{ name: 'Bob' }]), false)
})
