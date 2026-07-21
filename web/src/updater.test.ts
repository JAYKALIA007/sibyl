// The update check is the only outbound request Sibyl makes, and it's gated on an
// explicit yes. These cover that gate: the tri-state (unasked / yes / no) and the
// fact that the browser build never opts in at all.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideAutoCheck, updateBus } from './updater'

test('first run on desktop is unasked, not opted in', () => {
  assert.equal(decideAutoCheck(true, null), null)
})

test('a stored yes opts in', () => {
  assert.equal(decideAutoCheck(true, 'true'), true)
})

test('a stored no stays opted out', () => {
  assert.equal(decideAutoCheck(true, 'false'), false)
})

test('the browser build never asks and never opts in', () => {
  // false, NOT null — the web app must not render the opt-in prompt at all, even
  // though it has no stored answer.
  assert.equal(decideAutoCheck(false, null), false)
})

test('the browser build ignores a yes carried over from the desktop app', () => {
  // Same localStorage origin can serve both surfaces in dev.
  assert.equal(decideAutoCheck(false, 'true'), false)
})

test('a corrupt stored value is treated as no, not as yes', () => {
  assert.equal(decideAutoCheck(true, 'yes'), false)
  assert.equal(decideAutoCheck(true, ''), false)
})

test('updateBus delivers a manual check request to its subscriber', () => {
  let calls = 0
  const unsubscribe = updateBus.subscribe(() => calls++)
  updateBus.requestCheck()
  assert.equal(calls, 1)

  unsubscribe()
  updateBus.requestCheck()
  assert.equal(calls, 1)
})
