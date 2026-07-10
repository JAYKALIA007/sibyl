import { useEffect, useRef, useState } from 'react'
import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  useThread,
  useMessage,
  useComposer,
  useComposerRuntime,
  useAssistantRuntime,
} from '@assistant-ui/react'
import { cn } from './lib/utils'
import { AssistantAnswer } from './AssistantAnswer'
import { CommandAnswer } from './CommandAnswer'
import { matchCommands, type Command } from './commands'
import { readCommand, readResult } from './messageContract'
import { SparkleIcon, SendIcon } from './components/icons'
import { SibylMark } from './SibylMark'
import { PHASE_COPY, TIMING, resolveTarget, type Stage } from './suggestionStage'
import type { Meta } from './types'

export function Thread({ meta, suggestions }: { meta: Meta | null; suggestions: string[] | null }) {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col bg-background">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          <ThreadPrimitive.Empty>
            <EmptyState suggestions={suggestions} />
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        </div>
      </ThreadPrimitive.Viewport>

      <div className="border-t border-border bg-background/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4 pb-3 pt-2">
          <StatusBar meta={meta} />
          <Composer />
        </div>
      </div>
    </ThreadPrimitive.Root>
  )
}

function StatusBar({ meta }: { meta: Meta | null }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
      <span className={cn('h-1.5 w-1.5 rounded-full', meta ? 'bg-emerald-500' : 'bg-amber-500')} />
      {meta ? (
        <span>
          {meta.tables.toLocaleString('en-US')} table{meta.tables === 1 ? '' : 's'}
          <span className="mx-1.5 opacity-50">·</span>
          {meta.model}
        </span>
      ) : (
        <span>connecting…</span>
      )}
    </div>
  )
}

// Drives the cook → ready → reveal choreography from the `suggestions` prop
// (null = generating, [] = failed/empty, string[] = ready). The pure routing +
// timings live in suggestionStage.ts; this hook is just the timer wiring.
function useSuggestionStage(suggestions: string[] | null): Stage {
  const [stage, setStage] = useState<Stage>(() =>
    suggestions === null ? 'grace' : suggestions.length ? 'revealed' : 'fallback',
  )
  const cookStartRef = useRef(0)
  const loading = suggestions === null

  // (Re)start the choreography each time we enter a load — e.g. a connection switch
  // sets suggestions back to null. Hold off any cooking UI until the grace window
  // elapses, so cache hits (which resolve almost instantly) never show it.
  useEffect(() => {
    if (!loading) return
    setStage('grace')
    cookStartRef.current = 0
    const t = setTimeout(() => {
      cookStartRef.current = Date.now()
      setStage('cooking-1')
    }, TIMING.grace)
    return () => clearTimeout(t)
  }, [loading])

  // cooking-1 → cooking-2.
  useEffect(() => {
    if (stage !== 'cooking-1') return
    const t = setTimeout(() => setStage('cooking-2'), TIMING.phase1)
    return () => clearTimeout(t)
  }, [stage])

  // the "Ready" beat → reveal.
  useEffect(() => {
    if (stage !== 'ready') return
    const t = setTimeout(() => setStage('revealed'), TIMING.ready)
    return () => clearTimeout(t)
  }, [stage])

  // Suggestions resolved — route based on where we are, but never before the minimum
  // cook time (so "Ready" doesn't stutter in on an early resolve).
  useEffect(() => {
    if (suggestions === null) return
    if (stage === 'revealed' || stage === 'fallback' || stage === 'ready') return
    const target = resolveTarget(stage, suggestions)
    if (target === 'revealed') {
      setStage('revealed') // cache hit: straight in, no beat
      return
    }
    const elapsed = cookStartRef.current ? Date.now() - cookStartRef.current : TIMING.minCook
    const remaining = Math.max(0, TIMING.minCook - elapsed)
    const t = setTimeout(() => setStage(target), remaining)
    return () => clearTimeout(t)
  }, [suggestions, stage])

  return stage
}

function EmptyState({ suggestions }: { suggestions: string[] | null }) {
  const stage = useSuggestionStage(suggestions)

  const subcopy =
    stage === 'cooking-1' || stage === 'cooking-2'
      ? PHASE_COPY[stage]
      : stage === 'ready'
        ? 'Ready'
        : stage === 'fallback'
          ? 'Ask anything about your data — or type / for commands.'
          : 'Plain English in, SQL and answers out.'

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <SibylMark stage={stage} />
      <div>
        <h1 className="text-xl font-semibold">Ask your database</h1>
        <p
          aria-live="polite"
          className={cn(
            'mt-1 text-sm transition-colors',
            stage === 'ready' ? 'font-medium text-primary' : 'text-muted-foreground',
          )}
        >
          {subcopy}
        </p>
      </div>
      {stage === 'revealed' && suggestions && suggestions.length > 0 && (
        <div className="mt-2 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
          {suggestions.map((q, i) => (
            <ThreadPrimitive.Suggestion
              key={q}
              prompt={q}
              send
              style={{ animationDelay: `${i * TIMING.cascadeStep}ms` }}
              className={cn(
                'sibyl-rise rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground/90',
                'transition-colors hover:border-foreground/20 hover:bg-muted',
              )}
            >
              {q}
            </ThreadPrimitive.Suggestion>
          ))}
        </div>
      )}
    </div>
  )
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex flex-col items-end gap-1">
      <span className="pr-1 text-xs font-medium text-muted-foreground">You</span>
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  const result = useMessage((m) => readResult(m.metadata.custom))
  const command = useMessage((m) => readCommand(m.metadata.custom))
  const isRunning = useMessage((m) => m.status?.type === 'running')

  // A finished assistant turn with no result and no command means the run threw a
  // fault — that's handled by the top-level connection banner, so render no chat
  // bubble for it (never conflate an outage with a message).
  if (!result && !command && !isRunning) return null

  return (
    <MessagePrimitive.Root className="flex flex-col items-start gap-1">
      <span className="flex items-center gap-1 pl-1 text-xs font-medium text-muted-foreground">
        <SparkleIcon className="text-[13px]" /> Sibyl
      </span>
      <div className="w-full rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3">
        {result ? (
          <AssistantAnswer result={result} />
        ) : command ? (
          <CommandAnswer command={command} />
        ) : (
          <Thinking />
        )}
      </div>
    </MessagePrimitive.Root>
  )
}

function Thinking() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="flex gap-1">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </span>
      <span>Thinking…</span>
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
      style={{ animationDelay: delay }}
    />
  )
}

function Composer() {
  const isRunning = useThread((t) => t.isRunning)
  const text = useComposer((c) => c.text)
  const composer = useComposerRuntime()
  const assistant = useAssistantRuntime()

  // Escape hides the menu without clearing the text; typing re-arms it. Highlight
  // resets whenever the query changes so the top match is always pre-selected.
  const [dismissed, setDismissed] = useState(false)
  const [active, setActive] = useState(0)

  const matches = dismissed ? [] : matchCommands(text)
  const menuOpen = matches.length > 0
  const clampedActive = Math.min(active, matches.length - 1)

  useEffect(() => setActive(0), [text])
  useEffect(() => {
    if (!text.startsWith('/')) setDismissed(false)
  }, [text])

  function selectCommand(cmd: Command) {
    if (cmd.kind === 'action') {
      // '/new' — a UI action: reset the composer and start a fresh thread. It
      // never becomes a message or reaches the runtime.
      composer.setText('')
      assistant.threads.switchToNewThread()
      return
    }
    if (cmd.takesArg) {
      // '/sql' — prime the composer and let the user type the query; don't send yet.
      composer.setText(cmd.name + ' ')
      return
    }
    // setText is flushed synchronously (flushTapSync), so send() sees the command.
    composer.setText(cmd.name)
    composer.send()
  }

  // Own the keys only while the menu is open; otherwise fall through to the
  // composer's native Enter-to-send. preventDefault here also suppresses that
  // native handler (assistant-ui composes ours first and skips its own on
  // defaultPrevented), so Enter picks a command instead of sending raw text.
  function onKeyDown(e: React.KeyboardEvent) {
    if (!menuOpen) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => (i + 1) % matches.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => (i - 1 + matches.length) % matches.length)
        break
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        selectCommand(matches[clampedActive])
        break
      case 'Escape':
        e.preventDefault()
        setDismissed(true)
        break
    }
  }

  return (
    <div className="relative">
      {menuOpen && (
        <SlashMenu commands={matches} active={clampedActive} onPick={selectCommand} onHover={setActive} />
      )}
      <ComposerPrimitive.Root className="flex items-end gap-2 rounded-2xl border border-border bg-background p-1.5 shadow-sm focus-within:border-foreground/20 focus-within:ring-2 focus-within:ring-primary/10">
        <ComposerPrimitive.Input
          autoFocus
          rows={1}
          disabled={isRunning}
          onKeyDown={onKeyDown}
          placeholder={isRunning ? 'Thinking…' : 'Ask your database…  (type / for commands)'}
          className={cn(
            'flex-1 resize-none bg-transparent px-2.5 py-1.5 text-sm outline-none',
            'placeholder:text-muted-foreground disabled:opacity-60',
          )}
        />
        <ComposerPrimitive.Send
          aria-label="Ask"
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground',
            'transition-opacity hover:opacity-90 disabled:opacity-40',
          )}
        >
          <SendIcon className="text-base" />
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </div>
  )
}

function SlashMenu({
  commands,
  active,
  onPick,
  onHover,
}: {
  commands: Command[]
  active: number
  onPick: (cmd: Command) => void
  onHover: (index: number) => void
}) {
  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <div className="border-b border-border/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Commands
      </div>
      <ul className="py-1">
        {commands.map((cmd, i) => (
          <li key={cmd.name}>
            <button
              type="button"
              // onMouseDown (not onClick): fires before the input's blur, so the
              // composer keeps focus and the send/setText lands cleanly.
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(cmd)
              }}
              onMouseEnter={() => onHover(i)}
              className={cn(
                'flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-sm',
                i === active ? 'bg-muted' : 'hover:bg-muted/60',
              )}
            >
              <code className="shrink-0 font-mono text-xs text-primary">{cmd.name}</code>
              <span className="truncate text-muted-foreground">{cmd.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
