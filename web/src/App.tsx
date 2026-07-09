import { useEffect, useState } from 'react'
import { useAssistantRuntime } from '@assistant-ui/react'
import { SibylRuntimeProvider } from './runtime'
import { Thread } from './thread'
import { faultBus } from './faults'
import { SparkleIcon, PlusIcon } from './components/icons'

export function App() {
  return (
    <SibylRuntimeProvider>
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <Header />
        <FaultBanner />
        <div className="min-h-0 flex-1">
          <Thread />
        </div>
      </div>
    </SibylRuntimeProvider>
  )
}

function Header() {
  const runtime = useAssistantRuntime()
  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <SparkleIcon className="text-sm" />
        </span>
        <span className="font-semibold tracking-tight">Sibyl</span>
        <span className="hidden text-sm text-muted-foreground sm:inline">
          — ask your database in plain English
        </span>
      </div>
      <button
        onClick={() => runtime.threads.switchToNewThread()}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted"
      >
        <PlusIcon className="text-[15px]" /> New
      </button>
    </header>
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
