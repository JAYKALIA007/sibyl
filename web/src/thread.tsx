import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  useThread,
  useMessage,
} from '@assistant-ui/react'
import { cn } from './lib/utils'
import { AssistantAnswer } from './AssistantAnswer'
import { SparkleIcon, SendIcon } from './components/icons'
import type { AskResult } from './types'

const EXAMPLES = [
  'How many orders did each user place?',
  'Which products have never been reviewed?',
  'What is total revenue by product category?',
  'List the top 5 customers by amount spent.',
]

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col bg-background">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          <ThreadPrimitive.Empty>
            <EmptyState />
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        </div>
      </ThreadPrimitive.Viewport>

      <div className="border-t border-border bg-background/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          <Composer />
        </div>
      </div>
    </ThreadPrimitive.Root>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <SparkleIcon className="text-lg" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Ask your database</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plain English in, SQL and answers out.
        </p>
      </div>
      <div className="mt-2 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {EXAMPLES.map((q) => (
          <ThreadPrimitive.Suggestion
            key={q}
            prompt={q}
            send
            className={cn(
              'rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground/90',
              'transition-colors hover:border-foreground/20 hover:bg-muted',
            )}
          >
            {q}
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
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
  const result = useMessage(
    (m) => (m.metadata.custom as { result?: AskResult } | undefined)?.result,
  )
  const isRunning = useMessage((m) => m.status?.type === 'running')

  // A finished assistant turn with no result means the run threw a fault — that's
  // handled by the top-level connection banner, so render no chat bubble for it
  // (never conflate an outage with a message).
  if (!result && !isRunning) return null

  return (
    <MessagePrimitive.Root className="flex flex-col items-start gap-1">
      <span className="flex items-center gap-1 pl-1 text-xs font-medium text-muted-foreground">
        <SparkleIcon className="text-[13px]" /> Sibyl
      </span>
      <div className="w-full rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3">
        {result ? <AssistantAnswer result={result} /> : <Thinking />}
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
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 rounded-2xl border border-border bg-background p-1.5 shadow-sm focus-within:border-foreground/20 focus-within:ring-2 focus-within:ring-primary/10">
      <ComposerPrimitive.Input
        autoFocus
        rows={1}
        disabled={isRunning}
        placeholder={isRunning ? 'Thinking…' : 'Ask your database…'}
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
  )
}
