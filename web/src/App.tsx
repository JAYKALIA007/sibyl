import { useEffect, useState } from 'react'
import { useAssistantRuntime } from '@assistant-ui/react'
import { SibylRuntimeProvider } from './runtime'
import { Thread } from './thread'
import { faultBus } from './faults'
import { getMeta, getSuggestions } from './api'
import { currentTheme, setTheme, type Theme } from './theme'
import { SparkleIcon, PlusIcon, SunIcon, MoonIcon } from './components/icons'
import type { Meta } from './types'

export function App() {
  const [theme, setThemeState] = useState<Theme>(currentTheme)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [suggestions, setSuggestions] = useState<string[] | null>(null)

  useEffect(() => {
    getMeta().then(setMeta)
    getSuggestions().then(setSuggestions)
  }, [])

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  return (
    <SibylRuntimeProvider>
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <TopBar theme={theme} onToggleTheme={toggleTheme} meta={meta} />
        <FaultBanner />
        <div className="min-h-0 flex-1">
          <Thread meta={meta} suggestions={suggestions} />
        </div>
      </div>
    </SibylRuntimeProvider>
  )
}

function TopBar({
  theme,
  onToggleTheme,
  meta,
}: {
  theme: Theme
  onToggleTheme: () => void
  meta: Meta | null
}) {
  const runtime = useAssistantRuntime()
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <SparkleIcon className="text-sm" />
        </span>
        <span className="font-semibold tracking-tight">Sibyl</span>
        {meta?.database && (
          <span className="hidden max-w-[22rem] truncate text-xs text-muted-foreground sm:inline">
            {meta.database}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <ConnectionDot meta={meta} />
        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground/70 transition-colors hover:bg-muted"
        >
          {theme === 'dark' ? <SunIcon className="text-[15px]" /> : <MoonIcon className="text-[15px]" />}
        </button>
        <button
          onClick={() => runtime.threads.switchToNewThread()}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted"
        >
          <PlusIcon className="text-[15px]" /> New
        </button>
      </div>
    </header>
  )
}

function ConnectionDot({ meta }: { meta: Meta | null }) {
  const connected = meta !== null
  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
      <span
        className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`}
      />
      {connected ? 'connected' : 'connecting…'}
    </span>
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
