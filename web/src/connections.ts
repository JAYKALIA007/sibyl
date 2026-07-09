// Client-side active-connection state. The client owns which DB is active (ADR
// 0001) — it lives in localStorage so reopening the app returns to the same DB.
// resolveActiveConnection is pure and unit-tested.

import type { ConnectionView } from './types'

const KEY = 'sibyl-active-connection'

export function getStoredActiveId(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setStoredActiveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    // storage unavailable (private mode / disabled) — active state is just not persisted
  }
}

// Pick the active connection: the stored one if it still exists, else the first
// connection, else null (empty registry → the add-your-first-connection state).
export function resolveActiveConnection(
  storedId: string | null,
  list: ConnectionView[],
): string | null {
  if (list.length === 0) return null
  if (storedId && list.some((c) => c.id === storedId)) return storedId
  return list[0].id
}
