import { useEffect, useRef, useState } from 'react'
import { useAssistantRuntime } from '@assistant-ui/react'
import { SibylRuntimeProvider } from './runtime'
import { Thread } from './thread'
import { Sidebar } from './Sidebar'
import { AddConnectionModal } from './AddConnectionModal'
import { Onboarding } from './Onboarding'
import { faultBus } from './faults'
import { getModels, getSetup, pullModel, waitForSidecar } from './api'
import { useActiveConnection, type ActiveConnection } from './useActiveConnection'
import { currentTheme, setTheme, type Theme } from './theme'
import { PlusIcon, DatabaseIcon, SidebarIcon } from './components/icons'
import type { ConnectionView, Meta, ModelsInfo, Setup } from './types'

const COLLAPSE_KEY = 'sibyl-sidebar-collapsed'
const MODEL_KEY = 'sibyl-model'

const NO_MODELS: ModelsInfo = { active: '', installed: [], catalog: [] }

// Per-model download state, keyed by model name. `percent` is null while Ollama is
// still resolving the manifest (before byte counts arrive).
export type PullState = { percent: number | null; status: string } | { error: string }

export function App() {
  const [theme, setThemeState] = useState<Theme>(currentTheme)
  // null = still probing the local LLM; gates the app behind onboarding until ready.
  const [setup, setSetup] = useState<Setup | null>(null)
  const [models, setModels] = useState<ModelsInfo>(NO_MODELS)
  // The chosen local model (undefined = the server default). Persisted across reloads.
  const [selectedModel, setSelectedModel] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(MODEL_KEY) ?? undefined
    } catch {
      return undefined
    }
  })

  function selectModel(name: string) {
    setSelectedModel(name)
    try {
      localStorage.setItem(MODEL_KEY, name)
    } catch {
      // storage unavailable — the choice just won't persist across reloads
    }
  }

  // In-app model download. Lives here (not in the picker) so progress survives the
  // dropdown closing. On success we refetch the installed list and select the model.
  const [pulls, setPulls] = useState<Record<string, PullState>>({})
  function startPull(name: string) {
    if (pulls[name] && !('error' in pulls[name])) return // already downloading
    setPulls((p) => ({ ...p, [name]: { percent: null, status: 'starting' } }))
    pullModel(name, {
      onProgress: ({ status, total, completed }) => {
        const percent = total ? Math.round(((completed ?? 0) / total) * 100) : null
        setPulls((p) => ({ ...p, [name]: { percent, status } }))
      },
    })
      .then(() => {
        setPulls((p) => {
          const next = { ...p }
          delete next[name]
          return next
        })
        getModels().then(setModels)
        selectModel(name)
      })
      .catch((e) => {
        setPulls((p) => ({ ...p, [name]: { error: e instanceof Error ? e.message : String(e) } }))
      })
  }

  // Resetting the thread on a connection switch needs the assistant-ui runtime, which
  // only exists inside the provider below — but activeId (read to build the provider)
  // is owned by the hook up here. This ref bridges that: Workspace fills it with the
  // real reset, the hook calls it on every switch.
  const resetThreadRef = useRef<() => void>(() => {})
  const conn = useActiveConnection(() => resetThreadRef.current())

  useEffect(() => {
    waitForSidecar().then(() => {
      getSetup().then(setSetup)
      getModels().then(setModels)
    })
  }, [])

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
    <SibylRuntimeProvider activeConnectionId={conn.activeId} activeModel={selectedModel}>
      <Workspace
        theme={theme}
        onToggleTheme={toggleTheme}
        conn={conn}
        resetThreadRef={resetThreadRef}
        models={models}
        selectedModel={selectedModel}
        onSelectModel={selectModel}
        pulls={pulls}
        onPull={startPull}
      />
    </SibylRuntimeProvider>
  )
}

// Lives inside the runtime provider so it can reset the thread on a connection
// switch (the honest model: a different database is a fresh context — ADR 0001).
function Workspace({
  theme,
  onToggleTheme,
  conn,
  resetThreadRef,
  models,
  selectedModel,
  onSelectModel,
  pulls,
  onPull,
}: {
  theme: Theme
  onToggleTheme: () => void
  conn: ActiveConnection
  resetThreadRef: React.MutableRefObject<() => void>
  models: ModelsInfo
  selectedModel: string | undefined
  onSelectModel: (name: string) => void
  pulls: Record<string, PullState>
  onPull: (name: string) => void
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
  const { connections, activeId, meta, suggestions } = conn
  const list = connections ?? []

  // Give the hook the runtime-backed thread reset it can't reach on its own.
  useEffect(() => {
    resetThreadRef.current = () => runtime.threads.switchToNewThread()
  }, [runtime, resetThreadRef])

  function setCollapsedPersisted(next: boolean) {
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch {
      // storage unavailable — collapse just won't persist across reloads
    }
  }

  function handleAdded(newConn: ConnectionView) {
    setAddingOpen(false)
    conn.add(newConn)
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
          onSwitch={conn.switchTo}
          onRenamed={conn.rename}
          onDeleted={conn.remove}
          theme={theme}
          onToggleTheme={onToggleTheme}
          activeModel={selectedModel ?? models.active}
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
            <Thread
              meta={meta}
              suggestions={suggestions}
              models={models}
              selectedModel={selectedModel}
              onSelectModel={onSelectModel}
              pulls={pulls}
              onPull={onPull}
            />
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
      <span>⚠ Can’t reach Sibyl: {message}</span>
      <button
        onClick={() => setMessage(null)}
        className="rounded px-2 py-0.5 text-xs font-medium hover:bg-destructive/10"
      >
        Dismiss
      </button>
    </div>
  )
}
