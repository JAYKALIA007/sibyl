import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planCommand } from './composerDispatch.ts'
import { COMMANDS } from './commands.ts'

const byName = (name: string) => COMMANDS.find((c) => c.name === name)!

test('/new is a UI action → new-thread', () => {
  assert.deepEqual(planCommand(byName('/new')), { kind: 'new-thread' })
})

test('/sql takes an argument → prime the composer (trailing space), do not send', () => {
  assert.deepEqual(planCommand(byName('/sql')), { kind: 'prime', text: '/sql ' })
})

test('content commands send immediately with their name', () => {
  assert.deepEqual(planCommand(byName('/schema')), { kind: 'send', text: '/schema' })
  assert.deepEqual(planCommand(byName('/tables')), { kind: 'send', text: '/tables' })
  assert.deepEqual(planCommand(byName('/help')), { kind: 'send', text: '/help' })
})
