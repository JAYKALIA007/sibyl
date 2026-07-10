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

// ── impure shell ─────────────────────────────────────────────────────────────────

function writeConnections(list: Connection[]): void {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(list, null, 2))
  try {
    chmodSync(FILE, 0o600) // credentials live here — owner read/write only
  } catch {
    // best-effort (e.g. a filesystem without POSIX perms); the file is still local-only
  }
}

// The registry as stored. On first ever read (no file), seed `default` from
// DATABASE_URL and persist it, so existing users boot straight onto their DB.
function readConnections(): Connection[] {
  if (!existsSync(FILE)) {
    const seeded = seedDefault([], process.env.DATABASE_URL)
    if (seeded.length) writeConnections(seeded)
    return seeded
  }
  return parseConnections(readFileSync(FILE, 'utf8'))
}

export function listConnections(): ConnectionView[] {
  return readConnections().map(toView)
}

export function findConnection(id: string): Connection | undefined {
  return readConnections().find((c) => c.id === id)
}

// Validate (probe) before persisting — never save a connection we can't reach.
export async function addConnection(
  input: { name?: string; url: string; color?: string },
): Promise<{ ok: true; view: ConnectionView; tables: number } | { ok: false; error: string; hint: string }> {
  const probe = await probeConnection(input.url)
  if (!probe.ok) return { ok: false, error: probe.error, hint: classifyConnError(probe.error) }

  const conn: Connection = {
    id: randomUUID(),
    name: input.name?.trim() || connectionLabel(input.url),
    url: input.url,
    ...(input.color ? { color: input.color } : {}),
  }
  writeConnections(upsertConnection(readConnections(), conn))
  return { ok: true, view: toView(conn), tables: probe.tableCount }
}

export function deleteConnectionById(id: string): void {
  writeConnections(removeConnection(readConnections(), id))
}

export function renameConnectionById(id: string, name: string): ConnectionView | undefined {
  const list = renameConnection(readConnections(), id, name)
  const found = list.find((c) => c.id === id)
  if (!found) return undefined
  writeConnections(list)
  return toView(found)
}
