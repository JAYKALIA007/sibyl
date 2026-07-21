// The left rail: the app's identity, the list of saved connections (switch, rename,
// delete), an "add connection" trigger (opens a modal — owned by Workspace), and the
// theme toggle. Connection switching + adding are disabled while a turn is in flight
// (a switch resets the thread — see App).

import { useState, useRef, useEffect } from 'react'
import { useThread } from '@assistant-ui/react'
import { cn } from './lib/utils'
import { renameConnection, deleteConnection, isDesktop } from './api'
import {
  SparkleIcon,
  DatabaseIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  SidebarIcon,
  SunIcon,
  MoonIcon,
  MoreHorizontalIcon,
  BookIcon,
  MessageIcon,
} from './components/icons'
import type { ConnectionView } from './types'
import type { Theme } from './theme'

const REPO = 'https://github.com/JAYKALIA007/sibyl'
const DOCS_URL = `${REPO}#readme`

// Prefill a bug/feedback report with the environment so reports arrive with triage
// context.
function feedbackUrl(activeModel: string): string {
  const surface = isDesktop ? 'desktop' : 'web'
  const body = [
    '**What happened?**',
    '',
    '',
    '**What did you expect?**',
    '',
    '',
    '---',
    `- Model: ${activeModel || '(default)'}`,
    `- Surface: ${surface}`,
    '- OS: ',
    '',
  ].join('\n')
  return `${REPO}/issues/new?labels=feedback&body=${encodeURIComponent(body)}`
}

export function Sidebar({
  connections,
  activeId,
  activeTables,
  onOpenAdd,
  onCollapse,
  onSwitch,
  onRenamed,
  onDeleted,
  theme,
  onToggleTheme,
  activeModel,
}: {
  connections: ConnectionView[]
  activeId: string | null
  activeTables: number | null
  onOpenAdd: () => void
  onCollapse: () => void
  onSwitch: (id: string) => void
  onRenamed: (view: ConnectionView) => void
  onDeleted: (id: string) => void
  theme: Theme
  onToggleTheme: () => void
  activeModel: string
}) {
  // A switch resets the thread, so block it (and adding) mid-run.
  const busy = useThread((t) => t.isRunning)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <SparkleIcon className="text-sm" />
          </span>
          <span className="font-semibold tracking-tight">Sibyl</span>
        </div>
        <button
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <SidebarIcon className="text-[15px]" />
        </button>
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

        <button
          type="button"
          disabled={busy}
          onClick={onOpenAdd}
          className={cn(
            'mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground',
            'transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40',
          )}
        >
          <PlusIcon className="text-[15px]" /> Add connection
        </button>
      </div>

      <div className="border-t border-border p-2">
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <BookIcon className="text-[15px]" /> Docs
        </a>
        <a
          href={feedbackUrl(activeModel)}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MessageIcon className="text-[15px]" /> Report an issue
        </a>
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
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
          active ? 'bg-primary/10' : 'hover:bg-muted disabled:opacity-40',
        )}
      >
        <span
          className={cn('flex shrink-0 items-center', !conn.color && (active ? 'text-primary' : 'text-muted-foreground'))}
          {...(conn.color ? { style: { color: conn.color } } : {})}
        >
          <DatabaseIcon className="text-[15px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">{conn.name}</span>
          {conn.label !== conn.name && (
            <span className="block truncate text-[11px] text-muted-foreground">{conn.label}</span>
          )}
        </span>
        {active && tables !== null && (
          <span className="shrink-0 self-center rounded-full bg-primary/15 px-1.5 text-[11px] font-medium text-primary">
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
        <div className="absolute right-1 top-1.5 hidden group-hover:flex group-focus-within:flex">
          <OverflowMenu
            disabled={busy}
            onRename={() => { setName(conn.name); setMode('rename') }}
            onDelete={() => setMode('confirmDelete')}
          />
        </div>
      )}
    </li>
  )
}

function OverflowMenu({
  disabled,
  onRename,
  onDelete,
}: {
  disabled: boolean
  onRename: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More options"
        title="More options"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="flex h-6 w-6 items-center justify-center rounded-md bg-panel text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <MoreHorizontalIcon className="text-[15px]" />
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-50 min-w-[120px] rounded-lg border border-border bg-panel py-1 shadow-md">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onRename() }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            <PencilIcon className="text-[13px] text-muted-foreground" />
            Rename
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete() }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-muted"
          >
            <TrashIcon className="text-[13px]" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
