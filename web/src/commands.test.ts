import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchCommands, parseCommand, COMMANDS } from './commands.ts'

test('bare slash offers every command', () => {
  assert.deepEqual(
    matchCommands('/').map((c) => c.name),
    COMMANDS.map((c) => c.name),
  )
})

test('prefix filters the menu', () => {
  assert.deepEqual(matchCommands('/s').map((c) => c.name), ['/schema'])
  assert.deepEqual(matchCommands('/t').map((c) => c.name), ['/tables'])
  assert.deepEqual(matchCommands('/ne').map((c) => c.name), ['/new'])
})

test('matching is case-insensitive', () => {
  assert.deepEqual(matchCommands('/SCH').map((c) => c.name), ['/schema'])
})

test('a fully typed command still matches itself', () => {
  assert.deepEqual(matchCommands('/schema').map((c) => c.name), ['/schema'])
})

test('no menu without a leading slash', () => {
  assert.deepEqual(matchCommands('how many users'), [])
  assert.deepEqual(matchCommands(''), [])
})

test('a space ends the command context (it is a question now)', () => {
  assert.deepEqual(matchCommands('/schema of users'), [])
})

test('an unknown prefix offers nothing', () => {
  assert.deepEqual(matchCommands('/zzz'), [])
})

test('parseCommand matches exact commands only, trimmed and case-insensitive', () => {
  assert.equal(parseCommand('/schema')?.name, '/schema')
  assert.equal(parseCommand('  /Tables  ')?.name, '/tables')
  assert.equal(parseCommand('/new')?.name, '/new')
})

test('parseCommand rejects non-commands and partials', () => {
  assert.equal(parseCommand('/sch'), null)
  assert.equal(parseCommand('/schema of users'), null)
  assert.equal(parseCommand('how many users'), null)
})
