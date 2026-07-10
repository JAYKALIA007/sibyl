import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTarget, TIMING } from './suggestionStage.ts'

test('empty result always routes to fallback — never celebrate nothing', () => {
  // Empty wins regardless of when it resolved.
  assert.equal(resolveTarget('grace', []), 'fallback')
  assert.equal(resolveTarget('cooking-1', []), 'fallback')
  assert.equal(resolveTarget('cooking-2', []), 'fallback')
})

test('cache hit (resolved within grace) skips cooking and reveals directly', () => {
  assert.equal(resolveTarget('grace', ['a', 'b']), 'revealed')
})

test('resolved mid-cook earns the ready beat', () => {
  assert.equal(resolveTarget('cooking-1', ['a']), 'ready')
  assert.equal(resolveTarget('cooking-2', ['a', 'b', 'c']), 'ready')
})

test('timings keep cooking-2 visible even on an early resolve', () => {
  // cooking-2 starts at phase1 (from cook start) and the ready beat is gated on
  // minCook (also from cook start), so cooking-2 is guaranteed at least this long —
  // otherwise a fast resolve could skip the second phase entirely.
  assert.ok(TIMING.minCook - TIMING.phase1 >= 250)
})
