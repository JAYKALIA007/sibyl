import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  connectionLabel,
  toView,
  parseConnections,
  seedDefault,
  upsertConnection,
  removeConnection,
  renameConnection,
  createRegistry,
  type RegistryStore,
  type ProbeFn,
} from './connections.ts'

test('connectionLabel is password-free and strips query params', () => {
  assert.equal(
    connectionLabel('postgresql://sibyl_ro:sup3r$ecret@db.example.co:5432/postgres?sslmode=require'),
    'sibyl_ro@db.example.co/postgres',
  )
})

test('connectionLabel defaults an empty path to postgres and tolerates junk', () => {
  assert.equal(connectionLabel('postgresql://u:p@localhost:5432/'), 'u@localhost/postgres')
  assert.equal(connectionLabel('not a url'), '')
})

test('toView never leaks the URL and falls back to the label for a blank name', () => {
  const v = toView({ id: '1', name: '', url: 'postgresql://u:secret@h:5432/mydb' })
  assert.deepEqual(v, { id: '1', name: 'u@h/mydb', label: 'u@h/mydb' })
  assert.ok(!JSON.stringify(v).includes('secret'))
})

test('toView keeps an explicit name', () => {
  const v = toView({ id: '1', name: 'Fantasy WC', url: 'postgresql://u:p@h:5432/wc' })
  assert.equal(v.name, 'Fantasy WC')
  assert.equal(v.label, 'u@h/wc')
})

test('color round-trips through toView and parseConnections, absent when unset', () => {
  const withColor = toView({ id: '1', name: 'A', url: 'postgresql://u@h/a', color: '#f59e0b' })
  assert.equal(withColor.color, '#f59e0b')
  assert.equal('color' in toView({ id: '2', name: 'B', url: 'postgresql://u@h/b' }), false)

  const parsed = parseConnections(
    JSON.stringify([
      { id: 'a', name: 'A', url: 'postgresql://u@h/a', color: '#10b981' },
      { id: 'b', name: 'B', url: 'postgresql://u@h/b' },
    ]),
  )
  assert.equal(parsed[0].color, '#10b981')
  assert.equal('color' in parsed[1], false)
})

test('parseConnections keeps valid records and drops malformed ones', () => {
  const raw = JSON.stringify([
    { id: 'a', name: 'A', url: 'postgresql://x@h/a' },
    { id: 'b', url: 'postgresql://x@h/b' }, // no name → defaulted to ''
    { name: 'no id' }, // dropped
    { id: 'c' }, // no url → dropped
  ])
  assert.deepEqual(parseConnections(raw), [
    { id: 'a', name: 'A', url: 'postgresql://x@h/a' },
    { id: 'b', name: '', url: 'postgresql://x@h/b' },
  ])
})

test('parseConnections returns [] for non-arrays and garbage', () => {
  assert.deepEqual(parseConnections('{}'), [])
  assert.deepEqual(parseConnections('nonsense'), [])
})

test('seedDefault adds a default only into an empty list with a URL', () => {
  assert.deepEqual(seedDefault([], 'postgresql://u:p@h/db'), [
    { id: 'default', name: 'default', url: 'postgresql://u:p@h/db' },
  ])
})

test('seedDefault is a no-op when the registry is non-empty (registry wins)', () => {
  const existing = [{ id: 'x', name: 'x', url: 'postgresql://u@h/x' }]
  assert.deepEqual(seedDefault(existing, 'postgresql://u:p@h/db'), existing)
})

test('seedDefault is a no-op with no DATABASE_URL', () => {
  assert.deepEqual(seedDefault([], undefined), [])
})

test('upsertConnection appends a new id and replaces an existing one', () => {
  const list = [{ id: 'a', name: 'A', url: 'postgresql://u@h/a' }]
  const added = upsertConnection(list, { id: 'b', name: 'B', url: 'postgresql://u@h/b' })
  assert.equal(added.length, 2)
  const replaced = upsertConnection(added, { id: 'a', name: 'A2', url: 'postgresql://u@h/a2' })
  assert.deepEqual(replaced.find((c) => c.id === 'a'), { id: 'a', name: 'A2', url: 'postgresql://u@h/a2' })
  assert.equal(replaced.length, 2)
})

test('removeConnection drops by id', () => {
  const list = [
    { id: 'a', name: 'A', url: 'postgresql://u@h/a' },
    { id: 'b', name: 'B', url: 'postgresql://u@h/b' },
  ]
  assert.deepEqual(removeConnection(list, 'a'), [{ id: 'b', name: 'B', url: 'postgresql://u@h/b' }])
})

test('renameConnection changes only the target name', () => {
  const list = [
    { id: 'a', name: 'A', url: 'postgresql://u@h/a' },
    { id: 'b', name: 'B', url: 'postgresql://u@h/b' },
  ]
  const out = renameConnection(list, 'b', 'Beta')
  assert.equal(out.find((c) => c.id === 'b')?.name, 'Beta')
  assert.equal(out.find((c) => c.id === 'a')?.name, 'A')
})

// ── registry shell, over an in-memory store + fake probe ──────────────────────────

function memStore(initial: string | null = null): RegistryStore & { dump: () => string | null } {
  let data = initial
  return { read: () => data, write: (t) => { data = t }, dump: () => data }
}
const okProbe: ProbeFn = async () => ({ ok: true, tableCount: 3 })
const failProbe: ProbeFn = async () => ({ ok: false, error: 'getaddrinfo ENOTFOUND db.example.co' })
function seqUuid() {
  let n = 0
  return () => `id-${++n}`
}

test('registry seeds `default` from DATABASE_URL into an empty store and persists it', () => {
  const store = memStore(null)
  const reg = createRegistry({ store, probe: okProbe, databaseUrl: 'postgresql://u:p@h/db', uuid: seqUuid() })
  const list = reg.listConnections()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 'default')
  assert.ok(store.dump()?.includes('default')) // written back, so it survives re-reads
})

test('registry does not seed without a DATABASE_URL', () => {
  const reg = createRegistry({ store: memStore(null), probe: okProbe, uuid: seqUuid() })
  assert.deepEqual(reg.listConnections(), [])
})

test('registry tolerates a corrupt store as empty (no throw, no silent crash)', () => {
  const reg = createRegistry({ store: memStore('not json {['), probe: okProbe, uuid: seqUuid() })
  assert.deepEqual(reg.listConnections(), [])
})

test('addConnection does NOT persist when the probe fails, and returns a classified hint', async () => {
  const store = memStore('[]')
  const reg = createRegistry({ store, probe: failProbe, uuid: seqUuid() })
  const r = await reg.addConnection({ url: 'postgresql://u:p@db.example.co/db' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.hint, /host/i)
  assert.equal(reg.listConnections().length, 0)
})

test('addConnection persists on a good probe and is then findable', async () => {
  const store = memStore('[]')
  const reg = createRegistry({ store, probe: okProbe, uuid: seqUuid() })
  const r = await reg.addConnection({ name: 'Prod', url: 'postgresql://u:secret@h/db', color: '#f59e0b' })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.tables, 3)
    assert.equal(r.view.name, 'Prod')
    assert.equal(r.view.color, '#f59e0b')
    assert.ok(!JSON.stringify(r.view).includes('secret')) // view never leaks the URL
  }
  const list = reg.listConnections()
  assert.equal(list.length, 1)
  assert.equal(reg.findConnection(list[0].id)?.url, 'postgresql://u:secret@h/db')
})

test('rename persists and returns the view; an unknown id is a no-op', async () => {
  const store = memStore('[]')
  const reg = createRegistry({ store, probe: okProbe, uuid: seqUuid() })
  await reg.addConnection({ url: 'postgresql://u:p@h/db' })
  const id = reg.listConnections()[0].id

  assert.equal(reg.renameConnectionById(id, 'Renamed')?.name, 'Renamed')
  assert.equal(reg.findConnection(id)?.name, 'Renamed')

  const before = store.dump()
  assert.equal(reg.renameConnectionById('nope', 'x'), undefined)
  assert.equal(store.dump(), before) // untouched
})

test('delete removes the connection from the store', async () => {
  const store = memStore('[]')
  const reg = createRegistry({ store, probe: okProbe, uuid: seqUuid() })
  await reg.addConnection({ url: 'postgresql://u:p@h/db' })
  const id = reg.listConnections()[0].id
  reg.deleteConnectionById(id)
  assert.equal(reg.listConnections().length, 0)
})
