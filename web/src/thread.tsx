import {
  ThreadPrimitive,
  MessagePrimitive,
  MessagePartPrimitive,
  ComposerPrimitive,
  useThread,
} from '@assistant-ui/react'
import { cn } from './lib/utils'

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col bg-background">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
          <ThreadPrimitive.Empty>
            <EmptyState />
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        </div>
      </ThreadPrimitive.Viewport>

      <div className="border-t border-border bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          <Composer />
        </div>
      </div>
    </ThreadPrimitive.Root>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-20 text-center">
      <h1 className="text-2xl font-semibold">Sibyl</h1>
      <p className="text-muted-foreground">Ask your database in plain English.</p>
      <p className="text-sm text-muted-foreground">e.g. “How many orders did each user place?”</p>
    </div>
  )
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[80%] rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div className="max-w-[85%] rounded-lg border border-border bg-card px-4 py-3">
        <MessagePrimitive.Parts components={{ Text: AssistantText }} />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantText() {
  return (
    <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
      <MessagePartPrimitive.Text />
    </div>
  )
}

function Composer() {
  const isRunning = useThread((t) => t.isRunning)
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2">
      <ComposerPrimitive.Input
        autoFocus
        rows={1}
        disabled={isRunning}
        placeholder={isRunning ? 'Thinking…' : 'Ask your database…'}
        className={cn(
          'flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none',
          'focus:ring-2 focus:ring-primary/20 disabled:opacity-60',
        )}
      />
      <ComposerPrimitive.Send
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
      >
        Ask
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  )
}
