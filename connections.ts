// The saved-connection registry — the store behind the GUI's connection sidebar.
// A local JSON file at ~/.sibyl/connections.json (0600) holds [{id,name,url}]; the
// GUI switches between these without relaunching the process.
//
// Pure core (seed / upsert / remove / rename / label / parse) is unit-tested; the
// impure shell (file I/O, uuid, probing) is thin and verified end-to-end. Mirrors
// setup.ts. The raw URL — which carries the password — never leaves the server:
// callers surface a ConnectionView, whose `label` is password-free.

import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { probeConnection } from './db.ts'
import { classifyConnError } from './setup.ts'

export type Connection = { id: string; name: string; url: string; color?: string }
// What the client sees — never the raw URL.
export type ConnectionView = { id: string; name: string; label: string; color?: string }

const DIR = join(homedir(), '.sibyl')
const FILE = join(DIR, 'connections.json')

// ── pure core ───────────────────────────────────────────────────────────────────

// Password-free `user@host/db` for display. Consolidates the logic that used to be
// duplicated in server.dbLabel() and the CLI's parseConnInfo().
export function connectionLabel(url: string): string {
  try {
    const u = new URL(url.replace(/\?.*$/, '')) // drop query params before parsing
    const db = u.pathname.replace(/^\//, '') || 'postgres'
    return `${u.username}@${u.hostname}/${db}`
  } catch {
    return ''
  }
}

export function toView(c: Connection): ConnectionView {
  return {
    id: c.id,
    name: c.name || connectionLabel(c.url),
    label: connectionLabel(c.url),
    ...(c.color ? { color: c.color } : {}),
  }
}

// Tolerant parse: drop anything that isn't a well-formed {id,url} record.
export function parseConnections(raw: string): Connection[] {
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((c) => c && typeof c.id === 'string' && typeof c.url === 'string')
      .map((c) => ({
        id: c.id,
        name: typeof c.name === 'string' ? c.name : '',
        url: c.url,
        ...(typeof c.color === 'string' ? { color: c.color } : {}),
      }))
  } catch {
    return []
  }
}

// Seed a `default` entry from DATABASE_URL — but ONLY into an empty list. Once the
// registry exists it wins (the impure layer only calls this when the file is
// absent), so editing/deleting `default` sticks and re-reading .env can't resurrect it.
export function seedDefault(list: Connection[], databaseUrl?: string): Connection[] {
  if (list.length > 0 || !databaseUrl) return list
  return [{ id: 'default', name: 'default', url: databaseUrl }]
}

export function upsertConnection(list: Connection[], conn: Connection): Connection[] {
  const i = list.findIndex((c) => c.id === conn.id)
  if (i === -1) return [...list, conn]
  const next = [...list]
  next[i] = conn
  return next
}

export function removeConnection(list: Connection[], id: string): Connection[] {
  return list.filter((c) => c.id !== id)
}

export function renameConnection(list: Connection[], id: string, name: string): Connection[] {
  return list.map((c) => (c.id === id ? { ...c, name } : c))
}

// ── impure shell (dependency-injected) ────────────────────────────────────────────
// The registry logic is the same whether it's backed by a real file or an in-memory
// store, so the storage, the probe, and id generation are injected ports. Production
// wires the ~/.sibyl file + a live probe (below); tests wire an in-memory store + a
// fake probe, so the previously-untested paths — seeding, corruption tolerance,
// probe-then-save — are covered without touching the real filesystem or a database.

// Just enough storage for the registry's JSON blob. `read` returns null when absent.
// The production adapter owns the FS specifics (mkdir, 0600 chmod, path).
export type RegistryStore = {
  read: () => string | null
  write: (text: string) => void
}

export type ProbeFn = (
  url: string,
) => Promise<{ ok: true; tableCount: number } | { ok: false; error: string }>

export type RegistryDeps = {
  store: RegistryStore
  probe: ProbeFn
  databaseUrl?: string
  uuid: () => string
}

export type Registry = {
  listConnections: () => ConnectionView[]
  findConnection: (id: string) => Connection | undefined
  addConnection: (input: {
    name?: string
    url: string
    color?: string
  }) => Promise<{ ok: true; view: ConnectionView; tables: number } | { ok: false; error: string; hint: string }>
  deleteConnectionById: (id: string) => void
  renameConnectionById: (id: string, name: string) => ConnectionView | undefined
}

export function createRegistry(deps: RegistryDeps): Registry {
  // The registry as stored. On first ever read (no file), seed `default` from
  // DATABASE_URL and persist it, so existing users boot straight onto their DB.
  // A corrupt store is tolerated as an empty registry (parseConnections), never a throw.
  function read(): Connection[] {
    const raw = deps.store.read()
    if (raw === null) {
      const seeded = seedDefault([], deps.databaseUrl)
      if (seeded.length) write(seeded)
      return seeded
    }
    return parseConnections(raw)
  }

  function write(list: Connection[]): void {
    deps.store.write(JSON.stringify(list, null, 2))
  }

  function listConnections(): ConnectionView[] {
    return read().map(toView)
  }

  function findConnection(id: string): Connection | undefined {
    return read().find((c) => c.id === id)
  }

  // Validate (probe) before persisting — never save a connection we can't reach.
  async function addConnection(input: { name?: string; url: string; color?: string }) {
    const probe = await deps.probe(input.url)
    if (!probe.ok) return { ok: false as const, error: probe.error, hint: classifyConnError(probe.error) }

    const conn: Connection = {
      id: deps.uuid(),
      name: input.name?.trim() || connectionLabel(input.url),
      url: input.url,
      ...(input.color ? { color: input.color } : {}),
    }
    write(upsertConnection(read(), conn))
    return { ok: true as const, view: toView(conn), tables: probe.tableCount }
  }

  function deleteConnectionById(id: string): void {
    write(removeConnection(read(), id))
  }

  function renameConnectionById(id: string, name: string): ConnectionView | undefined {
    const list = renameConnection(read(), id, name)
    const found = list.find((c) => c.id === id)
    if (!found) return undefined
    write(list)
    return toView(found)
  }

  return { listConnections, findConnection, addConnection, deleteConnectionById, renameConnectionById }
}

// ── production wiring ──────────────────────────────────────────────────────────────
// The ~/.sibyl/connections.json store: owner-only (0600) since the raw URLs carry
// passwords. mkdir/chmod live here, out of the registry logic.
function fileStore(): RegistryStore {
  return {
    read: () => (existsSync(FILE) ? readFileSync(FILE, 'utf8') : null),
    write: (text) => {
      mkdirSync(DIR, { recursive: true })
      writeFileSync(FILE, text)
      try {
        chmodSync(FILE, 0o600) // credentials live here — owner read/write only
      } catch {
        // best-effort (e.g. a filesystem without POSIX perms); the file is still local-only
      }
    },
  }
}

const registry = createRegistry({
  store: fileStore(),
  probe: probeConnection,
  databaseUrl: process.env.DATABASE_URL,
  uuid: randomUUID,
})

export const listConnections = registry.listConnections
export const findConnection = registry.findConnection
export const addConnection = registry.addConnection
export const deleteConnectionById = registry.deleteConnectionById
export const renameConnectionById = registry.renameConnectionById
