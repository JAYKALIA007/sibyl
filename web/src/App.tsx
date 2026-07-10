import { useEffect, useState } from 'react'
import { useAssistantRuntime } from '@assistant-ui/react'
import { SibylRuntimeProvider } from './runtime'
import { Thread } from './thread'
import { Sidebar } from './Sidebar'
import { AddConnectionModal } from './AddConnectionModal'
import { Onboarding } from './Onboarding'
import { faultBus } from './faults'
import { getMeta, getSetup, getSuggestions, listConnections } from './api'
import {
  resolveActiveConnection,
  getStoredActiveId,
  setStoredActiveId,
} from './connections'
import { currentTheme, setTheme, type Theme } from './theme'
import { PlusIcon, DatabaseIcon, SidebarIcon } from './components/icons'
import type { ConnectionView, Meta, Setup } from './types'

const COLLAPSE_KEY = 'sibyl-sidebar-collapsed'

export function App() {
  const [theme, setThemeState] = useState<Theme>(currentTheme)
  // null = still probing the local LLM; gates the app behind onboarding until ready.
  const [setup, setSetup] = useState<Setup | null>(null)
  // null = still loading the registry; [] = loaded, none saved.
  const [connections, setConnections] = useState<ConnectionView[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [suggestions, setSuggestions] = useState<string[] | null>(null)

  useEffect(() => {
    getSetup().then(setSetup)
  }, [])

  useEffect(() => {
    listConnections().then((list) => {
      setConnections(list)
      const id = resolveActiveConnection(getStoredActiveId(), list)
      setActiveId(id)
      setStoredActiveId(id)
    })
  }, [])

  // Active connection changed → refetch its metadata + starter questions (a switch
  // also resets the thread, in Workspace).
  useEffect(() => {
    setMeta(null)
    setSuggestions(null)
    if (!activeId) return
    getMeta(activeId).then(setMeta)
    getSuggestions(activeId).then(setSuggestions)
  }, [activeId])

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  if (setup === null) return null // brief probe of the local LLM before first paint
  if (!setup.ready) {
    return <Onboarding setup={setup} onReady={() => getSetup().then(setSetup)} />
  }

  return (
    <SibylRuntimeProvider activeConnectionId={activeId}>
      <Workspace
        theme={theme}
        onToggleTheme={toggleTheme}
        connections={connections}
        setConnections={setConnections}
        activeId={activeId}
        setActiveId={setActiveId}
        meta={meta}
        suggestions={suggestions}
      />
    </SibylRuntimeProvider>
  )
}

// Lives inside the runtime provider so it can reset the thread on a connection
// switch (the honest model: a different database is a fresh context — ADR 0001).
function Workspace({
  theme,
  onToggleTheme,
  connections,
  setConnections,
  activeId,
  setActiveId,
  meta,
  suggestions,
}: {
  theme: Theme
  onToggleTheme: () => void
  connections: ConnectionView[] | null
  setConnections: (list: ConnectionView[]) => void
  activeId: string | null
  setActiveId: (id: string | null) => void
  meta: Meta | null
  suggestions: string[] | null
}) {
  const runtime = useAssistantRuntime()
  const [addingOpen, setAddingOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const list = connections ?? []

  function setCollapsedPersisted(next: boolean) {
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch {
      // storage unavailable — collapse just won't persist across reloads
    }
  }

  function switchTo(id: string | null) {
    if (id === activeId) return
    runtime.threads.switchToNewThread() // switch = fresh thread
    setActiveId(id)
    setStoredActiveId(id)
  }

  function handleAdded(conn: ConnectionView) {
    setConnections([...list, conn])
    setAddingOpen(false)
    switchTo(conn.id)
  }

  function handleRenamed(view: ConnectionView) {
    setConnections(list.map((c) => (c.id === view.id ? view : c)))
  }

  function handleDeleted(id: string) {
    const next = list.filter((c) => c.id !== id)
    setConnections(next)
    if (id === activeId) switchTo(next[0]?.id ?? null)
  }

  const activeConn = list.find((c) => c.id === activeId) ?? null

  return (
    <div className="flex h-full">
      {!collapsed && (
        <Sidebar
          connections={list}
          activeId={activeId}
          activeTables={meta?.tables ?? null}
          onOpenAdd={() => setAddingOpen(true)}
          onCollapse={() => setCollapsedPersisted(true)}
          onSwitch={switchTo}
          onRenamed={handleRenamed}
          onDeleted={handleDeleted}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <MainBar
          activeConn={activeConn}
          meta={meta}
          collapsed={collapsed}
          onExpand={() => setCollapsedPersisted(false)}
        />
        <FaultBanner />
        <div className="min-h-0 flex-1">
          {connections === null ? null : activeId ? (
            <Thread meta={meta} suggestions={suggestions} />
          ) : (
            <NoConnectionState hasSaved={list.length > 0} onAdd={() => setAddingOpen(true)} />
          )}
        </div>
      </div>

      {addingOpen && (
        <AddConnectionModal onClose={() => setAddingOpen(false)} onAdded={handleAdded} />
      )}
    </div>
  )
}

function MainBar({
  activeConn,
  meta,
  collapsed,
  onExpand,
}: {
  activeConn: ConnectionView | null
  meta: Meta | null
  collapsed: boolean
  onExpand: () => void
}) {
  const runtime = useAssistantRuntime()
  const label = meta?.database || activeConn?.label
  const dotColor = activeConn?.color
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {collapsed && (
          <button
            onClick={onExpand}
            aria-label="Show sidebar"
            title="Show sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SidebarIcon className="text-[15px]" />
          </button>
        )}
        {activeConn && (
          <>
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${!dotColor && (meta ? 'bg-emerald-500' : 'bg-amber-500')}`}
              {...(dotColor ? { style: { backgroundColor: dotColor } } : {})}
            />
            <span className="truncate text-sm font-medium">{activeConn.name}</span>
            {label && label !== activeConn.name && (
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">{label}</span>
            )}
          </>
        )}
      </div>
      {activeConn && (
        <button
          onClick={() => runtime.threads.switchToNewThread()}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted"
        >
          <PlusIcon className="text-[15px]" /> New
        </button>
      )}
    </header>
  )
}

function NoConnectionState({ hasSaved, onAdd }: { hasSaved: boolean; onAdd: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <DatabaseIcon className="text-lg" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">
          {hasSaved ? 'No connection selected' : 'Add your first connection'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasSaved
            ? 'Pick a database from the sidebar to start asking.'
            : 'Point Sibyl at a Postgres database to start asking questions.'}
        </p>
      </div>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <PlusIcon className="text-[15px]" /> Add connection
      </button>
    </div>
  )
}

// Connection-level faults (5xx / network) — distinct from chat messages.
function FaultBanner() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => faultBus.subscribe(setMessage), [])

  if (!message) return null
  return (
    <div className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
      <span>⚠ Can’t reach Sibyl — {message}</span>
      <button
        onClick={() => setMessage(null)}
        className="rounded px-2 py-0.5 text-xs font-medium hover:bg-destructive/10"
      >
        Dismiss
      </button>
    </div>
  )
}
