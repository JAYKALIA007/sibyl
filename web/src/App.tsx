import { useEffect, useState } from 'react'
import { SibylRuntimeProvider } from './runtime'
import { Thread } from './thread'
import { faultBus } from './faults'

export function App() {
  return (
    <SibylRuntimeProvider>
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <FaultBanner />
        <div className="min-h-0 flex-1">
          <Thread />
        </div>
      </div>
    </SibylRuntimeProvider>
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
