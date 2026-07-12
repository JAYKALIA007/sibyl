// The client's single source of truth for "which database am I talking to". Owns the
// registry list, the active id (resolved + persisted to localStorage), and the active
// connection's metadata + starter questions (refetched on every switch). The pure list
// algebra lives in connectionState.ts; this hook is the stateful shell around it.
//
// The one side-effect it can't own is resetting the chat thread on a switch — that
// needs the assistant-ui runtime, which only exists inside the provider, one level
// below where activeId must be read to build the provider. Callers inject it as
// onSwitch (see App.tsx's resetThreadRef seam).

import { useEffect, useState } from 'react'
import { getMeta, getSuggestions, listConnections } from './api'
import { getStoredActiveId, setStoredActiveId, resolveActiveConnection } from './connections'
import { withAdded, withRemoved, withRenamed } from './connectionState'
import type { ConnectionView, Meta } from './types'

export type ActiveConnection = {
  connections: ConnectionView[] | null // null = still loading the registry
  activeId: string | null
  meta: Meta | null
  suggestions: string[] | null
  switchTo: (id: string | null) => void
  add: (conn: ConnectionView) => void
  rename: (view: ConnectionView) => void
  remove: (id: string) => void
}

export function useActiveConnection(onSwitch?: () => void): ActiveConnection {
  const [connections, setConnections] = useState<ConnectionView[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [suggestions, setSuggestions] = useState<string[] | null>(null)

  // Load the registry once, then resolve + persist the active connection.
  useEffect(() => {
    listConnections().then((list) => {
      setConnections(list)
      const id = resolveActiveConnection(getStoredActiveId(), list)
      setActiveId(id)
      setStoredActiveId(id)
    })
  }, [])

  // Active connection changed → refetch its metadata + starter questions.
  useEffect(() => {
    setMeta(null)
    setSuggestions(null)
    if (!activeId) return
    getMeta(activeId).then(setMeta)
    getSuggestions(activeId).then(setSuggestions)
  }, [activeId])

  function switchTo(id: string | null) {
    if (id === activeId) return
    onSwitch?.() // a different database is a fresh context (ADR 0001)
    setActiveId(id)
    setStoredActiveId(id)
  }

  function add(conn: ConnectionView) {
    setConnections(withAdded(connections ?? [], conn))
    switchTo(conn.id)
  }

  function rename(view: ConnectionView) {
    setConnections(withRenamed(connections ?? [], view))
  }

  function remove(id: string) {
    const next = withRemoved(connections ?? [], id, activeId)
    setConnections(next.connections)
    if (next.activeId !== activeId) switchTo(next.activeId)
  }

  return { connections, activeId, meta, suggestions, switchTo, add, rename, remove }
}
