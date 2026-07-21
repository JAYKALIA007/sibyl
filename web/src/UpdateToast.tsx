// The one surface for in-app updates: a corner toast that walks opt-in → available →
// downloading → restart. Deliberately non-blocking at every step — an update should
// never take the app away from someone mid-question.
//
// On the web build this renders nothing (checkForUpdate resolves null off desktop).

import { useEffect, useState } from 'react'
import {
  autoCheckAllowed,
  checkForUpdate,
  restart,
  setAutoCheckAllowed,
  updateBus,
  type Available,
} from './updater'
import { DownloadIcon, SparkleIcon, XIcon } from './components/icons'

type State =
  | { kind: 'hidden' }
  | { kind: 'ask' }
  | { kind: 'available'; update: Available }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'current' }

export function UpdateToast() {
  const [state, setState] = useState<State>({ kind: 'hidden' })

  useEffect(() => {
    const allowed = autoCheckAllowed()
    if (allowed === null) {
      setState({ kind: 'ask' })
      return
    }
    if (!allowed) return
    void runCheck()
  }, [])

  // A manual check from the sidebar. Unlike the launch check it reports "up to date"
  // too — the user asked, so silence would read as broken.
  useEffect(() => updateBus.subscribe(() => void runCheck({ announceCurrent: true })), [])

  async function runCheck({ announceCurrent = false } = {}) {
    const update = await checkForUpdate()
    if (update) setState({ kind: 'available', update })
    else if (announceCurrent) setState({ kind: 'current' })
  }

  function answerOptIn(allowed: boolean) {
    setAutoCheckAllowed(allowed)
    setState({ kind: 'hidden' })
    // Saying yes checks straight away rather than making the user relaunch to find out.
    if (allowed) void runCheck()
  }

  async function startDownload(update: Available) {
    setState({ kind: 'downloading', version: update.version, percent: 0 })
    try {
      await update.download((percent) =>
        setState({ kind: 'downloading', version: update.version, percent }),
      )
      setState({ kind: 'ready', version: update.version })
    } catch {
      // A failed download is not worth a scary dialog — it retries next launch.
      setState({ kind: 'hidden' })
    }
  }

  if (state.kind === 'hidden') return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-80">
      <div className="pointer-events-auto rounded-xl border border-border bg-card p-3.5 shadow-lg">
        {state.kind === 'ask' && (
          <Shell
            icon={<SparkleIcon className="text-base" />}
            title="Check for updates?"
            body="Sibyl can check GitHub for new versions when it starts. It sends nothing about you, your questions, or your data. You can change this any time."
          >
            <Action onClick={() => answerOptIn(true)}>Yes, check</Action>
            <Secondary onClick={() => answerOptIn(false)}>No thanks</Secondary>
          </Shell>
        )}

        {state.kind === 'available' && (
          <Shell
            icon={<DownloadIcon className="text-base" />}
            title={`Sibyl ${state.update.version} is available`}
            body={state.update.notes?.trim() || 'A new version is ready to download.'}
            onDismiss={() => setState({ kind: 'hidden' })}
          >
            <Action onClick={() => void startDownload(state.update)}>Update</Action>
            <Secondary onClick={() => setState({ kind: 'hidden' })}>Later</Secondary>
          </Shell>
        )}

        {state.kind === 'downloading' && (
          <Shell
            icon={<DownloadIcon className="text-base" />}
            title={`Downloading ${state.version}…`}
            body={`${state.percent}%`}
          >
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${state.percent}%` }}
              />
            </div>
          </Shell>
        )}

        {state.kind === 'current' && (
          <Shell
            icon={<SparkleIcon className="text-base" />}
            title="Sibyl is up to date"
            body="You're running the latest version."
            onDismiss={() => setState({ kind: 'hidden' })}
          >
            <Secondary onClick={() => setState({ kind: 'hidden' })}>Dismiss</Secondary>
          </Shell>
        )}

        {state.kind === 'ready' && (
          <Shell
            icon={<SparkleIcon className="text-base" />}
            title={`Sibyl ${state.version} is ready`}
            body="Restart to finish installing. Your saved connections are kept."
            onDismiss={() => setState({ kind: 'hidden' })}
          >
            <Action onClick={() => void restart()}>Restart now</Action>
            <Secondary onClick={() => setState({ kind: 'hidden' })}>Later</Secondary>
          </Shell>
        )}
      </div>
    </div>
  )
}

function Shell({
  icon,
  title,
  body,
  onDismiss,
  children,
}: {
  icon: React.ReactNode
  title: string
  body: string
  onDismiss?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight">{title}</p>
          {onDismiss && (
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 rounded p-1 text-muted-foreground transition-colors hover:bg-muted"
            >
              <XIcon className="text-xs" />
            </button>
          )}
        </div>
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-2.5 flex items-center gap-2">{children}</div>
      </div>
    </div>
  )
}

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      {children}
    </button>
  )
}

function Secondary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
    >
      {children}
    </button>
  )
}
