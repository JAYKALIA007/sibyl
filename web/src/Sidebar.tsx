// The left rail: the app's identity, the list of saved connections (switch, rename,
// delete), an inline add-connection form, and the theme toggle. Connection
// switching + adding are disabled while a turn is in flight (a switch resets the
// thread — see App).

import { useState } from 'react'
import { useThread } from '@assistant-ui/react'
import { cn } from './lib/utils'
import { addConnection, renameConnection, deleteConnection } from './api'
import {
  SparkleIcon,
  DatabaseIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  SunIcon,
  MoonIcon,
} from './components/icons'
import type { ConnectionView } from './types'
import type { Theme } from './theme'

export function Sidebar({
  connections,
  activeId,
  activeTables,
  addingOpen,
  setAddingOpen,
  onSwitch,
  onAdded,
  onRenamed,
  onDeleted,
  theme,
  onToggleTheme,
}: {
  connections: ConnectionView[]
  activeId: string | null
  activeTables: number | null
  addingOpen: boolean
  setAddingOpen: (open: boolean) => void
  onSwitch: (id: string) => void
  onAdded: (connection: ConnectionView) => void
  onRenamed: (view: ConnectionView) => void
  onDeleted: (id: string) => void
  theme: Theme
  onToggleTheme: () => void
}) {
  // A switch resets the thread, so block it (and adding) mid-run.
  const busy = useThread((t) => t.isRunning)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <SparkleIcon className="text-sm" />
        </span>
        <span className="font-semibold tracking-tight">Sibyl</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <div className="px-1 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Connections
        </div>
        <ul className="flex flex-col gap-0.5">
          {connections.map((c) => (
            <ConnectionRow
              key={c.id}
              conn={c}
              active={c.id === activeId}
              tables={c.id === activeId ? activeTables : null}
              busy={busy}
              onSwitch={() => onSwitch(c.id)}
              onRenamed={onRenamed}
              onDeleted={onDeleted}
            />
          ))}
        </ul>

        {addingOpen ? (
          <AddForm busy={busy} onCancel={() => setAddingOpen(false)} onAdded={onAdded} />
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAddingOpen(true)}
            className={cn(
              'mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground',
              'transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40',
            )}
          >
            <PlusIcon className="text-[15px]" /> Add connection
          </button>
        )}
      </div>

      <div className="border-t border-border p-2">
        <button
          onClick={onToggleTheme}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {theme === 'dark' ? <SunIcon className="text-[15px]" /> : <MoonIcon className="text-[15px]" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </aside>
  )
}

function ConnectionRow({
  conn,
  active,
  tables,
  busy,
  onSwitch,
  onRenamed,
  onDeleted,
}: {
  conn: ConnectionView
  active: boolean
  tables: number | null
  busy: boolean
  onSwitch: () => void
  onRenamed: (view: ConnectionView) => void
  onDeleted: (id: string) => void
}) {
  const [mode, setMode] = useState<'idle' | 'rename' | 'confirmDelete'>('idle')
  const [name, setName] = useState(conn.name)

  async function submitRename() {
    const trimmed = name.trim()
    setMode('idle')
    if (!trimmed || trimmed === conn.name) return
    const view = await renameConnection(conn.id, trimmed)
    if (view) onRenamed(view)
  }

  async function confirmDelete() {
    setMode('idle')
    if (await deleteConnection(conn.id)) onDeleted(conn.id)
  }

  if (mode === 'rename') {
    return (
      <li>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitRename()
            if (e.key === 'Escape') {
              setName(conn.name)
              setMode('idle')
            }
          }}
          className="w-full rounded-lg border border-primary/40 bg-background px-2 py-1.5 text-sm outline-none ring-2 ring-primary/10"
        />
      </li>
    )
  }

  return (
    <li className="group relative">
      <button
        type="button"
        disabled={busy}
        onClick={onSwitch}
        title={conn.label}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
          active
            ? 'bg-primary/10 text-foreground'
            : 'text-foreground/80 hover:bg-muted disabled:opacity-40',
        )}
      >
        <DatabaseIcon className={cn('shrink-0 text-[15px]', active ? 'text-primary' : 'text-muted-foreground')} />
        <span className="min-w-0 flex-1 truncate">{conn.name}</span>
        {active && tables !== null && (
          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[11px] font-medium text-primary">
            {tables}
          </span>
        )}
      </button>

      {mode === 'confirmDelete' ? (
        <div className="mt-0.5 flex items-center gap-1 rounded-lg bg-destructive/10 px-2 py-1 text-xs">
          <span className="flex-1 text-destructive">Delete this connection?</span>
          <button onClick={confirmDelete} className="rounded px-1.5 py-0.5 font-medium text-destructive hover:bg-destructive/10">
            Delete
          </button>
          <button onClick={() => setMode('idle')} className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted">
            Cancel
          </button>
        </div>
      ) : (
        // Hover actions — hidden until you hover the row (or focus within), never
        // block the label, and disabled while a turn is running.
        <div className="absolute right-1 top-1 hidden items-center gap-0.5 group-hover:flex group-focus-within:flex">
          <IconAction label="Rename" disabled={busy} onClick={() => { setName(conn.name); setMode('rename') }}>
            <PencilIcon className="text-[13px]" />
          </IconAction>
          <IconAction label="Delete" disabled={busy} onClick={() => setMode('confirmDelete')}>
            <TrashIcon className="text-[13px]" />
          </IconAction>
        </div>
      )}
    </li>
  )
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md bg-panel text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function AddForm({
  busy,
  onCancel,
  onAdded,
}: {
  busy: boolean
  onCancel: () => void
  onAdded: (connection: ConnectionView) => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!url.trim() || saving) return
    setSaving(true)
    setError(null)
    const result = await addConnection({ name: name.trim() || undefined, url: url.trim() })
    setSaving(false)
    if (result.ok) onAdded(result.connection)
    else setError(result.error)
  }

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (optional)"
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="postgresql://sibyl_ro:…@host:5432/db"
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
      />
      <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">
        Use a read-only role (e.g. <code className="font-mono">sibyl_ro</code>) — Sibyl only ever reads.
      </p>
      {error && (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>
      )}
      <div className="flex items-center justify-end gap-1.5">
        <button
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || saving || !url.trim()}
          className="rounded-md bg-primary px-2.5 py-1 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'Testing…' : 'Add'}
        </button>
      </div>
    </div>
  )
}
