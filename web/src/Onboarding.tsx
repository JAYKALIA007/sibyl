// First-run onboarding. Sibyl needs a local LLM (Ollama + a pulled model) before it
// can turn questions into SQL, and the desktop shell boots the UI before that's
// necessarily true. This gates the app, walks the user through install → pull →
// connect, and polls GET /api/setup so it auto-advances (and dismisses) the moment
// the model is ready — no manual refresh needed.

import { useEffect, useState } from 'react'
import { getSetup } from './api'
import { CheckIcon, CopyIcon, SparkleIcon } from './components/icons'
import type { Setup } from './types'

const OLLAMA_DOWNLOAD = 'https://ollama.com/download'
const POLL_MS = 3000

type StepState = 'done' | 'active' | 'pending'

export function Onboarding({ setup, onReady }: { setup: Setup; onReady: () => void }) {
  const [current, setCurrent] = useState<Setup>(setup)
  const [checking, setChecking] = useState(false)

  // Poll until ready. A manual "Check again" shares the same refresh path.
  useEffect(() => {
    if (current.ready) {
      onReady()
      return
    }
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [current.ready]) // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    setChecking(true)
    setCurrent(await getSetup())
    setChecking(false)
  }

  const reachable = current.ready || current.reason !== 'unreachable'
  const modelReady = current.ready
  const pullCommand = current.ready ? `ollama pull ${current.model}` : current.pullCommand

  const step1: StepState = reachable ? 'done' : 'active'
  const step2: StepState = modelReady ? 'done' : reachable ? 'active' : 'pending'

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <SparkleIcon className="text-2xl" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to Sibyl</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Ask your database in plain English. Sibyl runs an AI model locally, so your
            data and questions never leave this machine. Two quick steps to get set up.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <Step
            n={1}
            state={step1}
            title="Install Ollama & start it"
            desc="Ollama runs the local model that powers Sibyl. Install it, then make sure the app is running."
          >
            {step1 !== 'done' && (
              <a
                href={OLLAMA_DOWNLOAD}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Download Ollama ↗
              </a>
            )}
          </Step>

          <div className="border-t border-border" />

          <Step
            n={2}
            state={step2}
            title="Pull the model"
            desc="Downloads the SQL model (~4.7 GB, one time). Run this in your terminal:"
          >
            {step2 !== 'done' && <CommandBlock command={pullCommand} />}
          </Step>

          <div className="border-t border-border" />

          <Step
            n={3}
            state="pending"
            title="Connect a database & ask"
            desc="Once the model's ready, point Sibyl at a Postgres database and start asking questions."
            last
          />
        </div>

        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            onClick={refresh}
            disabled={checking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {checking ? 'Checking…' : 'Check again'}
          </button>
          <span className="text-xs text-muted-foreground">
            {reachable ? 'Waiting for the model…' : 'Waiting for Ollama…'} checks automatically
          </span>
        </div>
      </div>
    </div>
  )
}

function Step({
  n,
  state,
  title,
  desc,
  children,
  last,
}: {
  n: number
  state: StepState
  title: string
  desc: string
  children?: React.ReactNode
  last?: boolean
}) {
  return (
    <div className={`flex gap-3.5 p-4 ${state === 'pending' ? 'opacity-60' : ''}`}>
      <div className="relative flex flex-col items-center">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            state === 'done'
              ? 'bg-primary text-primary-foreground'
              : state === 'active'
                ? 'bg-primary/15 text-primary ring-2 ring-primary/30'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          {state === 'done' ? <CheckIcon className="text-sm" /> : n}
        </div>
        {!last && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
        {children && <div className="mt-2.5">{children}</div>}
      </div>
    </div>
  )
}

function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked (rare on 127.0.0.1) — the command is still selectable
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{command}</code>
      <button
        onClick={copy}
        aria-label="Copy command"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? <CheckIcon className="text-sm text-primary" /> : <CopyIcon className="text-sm" />}
      </button>
    </div>
  )
}
