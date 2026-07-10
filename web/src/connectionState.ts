// Pure transitions for the connection registry the sidebar manages. The interesting
// logic — especially "which connection becomes active after deleting the active one" —
// lives here, out of the component, so it can be unit-tested. useActiveConnection wraps
// these with the React state, persistence, and refetch side-effects.

import type { ConnectionView } from './types'

export function withAdded(list: ConnectionView[], conn: ConnectionView): ConnectionView[] {
  return [...list, conn]
}

export function withRenamed(list: ConnectionView[], view: ConnectionView): ConnectionView[] {
  return list.map((c) => (c.id === view.id ? view : c))
}

// Remove a connection and report the resulting active id: unchanged when a background
// connection is removed, but when the ACTIVE one is removed it falls to the first
// remaining connection (or null when the registry empties).
export function withRemoved(
  list: ConnectionView[],
  id: string,
  activeId: string | null,
): { connections: ConnectionView[]; activeId: string | null } {
  const connections = list.filter((c) => c.id !== id)
  const nextActive = id === activeId ? (connections[0]?.id ?? null) : activeId
  return { connections, activeId: nextActive }
}
