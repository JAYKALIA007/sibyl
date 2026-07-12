import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routeMessage } from './messageRouting.ts'

test('/sql with a query routes to sql with the trimmed query', () => {
  assert.deepEqual(routeMessage('/sql select 1'), { kind: 'sql', query: 'select 1' })
  assert.deepEqual(routeMessage('/sql   select 1  '), { kind: 'sql', query: 'select 1' })
})

test('content commands route to command with the bare name', () => {
  assert.deepEqual(routeMessage('/schema'), { kind: 'command', name: 'schema' })
  assert.deepEqual(routeMessage('/tables'), { kind: 'command', name: 'tables' })
  assert.deepEqual(routeMessage('/help'), { kind: 'command', name: 'help' })
})

test('content command matching is case- and whitespace-insensitive', () => {
  assert.deepEqual(routeMessage('  /SCHEMA '), { kind: 'command', name: 'schema' })
})

test('a plain question routes to ask', () => {
  assert.deepEqual(routeMessage('how many users are there?'), { kind: 'ask' })
})

test('a question that merely mentions a slash word is not a command', () => {
  assert.deepEqual(routeMessage('what does /schema do?'), { kind: 'ask' })
})

test('/new (a UI action, never actually submitted) falls through to ask', () => {
  assert.deepEqual(routeMessage('/new'), { kind: 'ask' })
})
