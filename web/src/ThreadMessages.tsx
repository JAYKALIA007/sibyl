// How each message bubble renders. A user message is its plain text; an assistant
// message reads the typed metadata contract and renders a rich answer, a command
// result, or the thinking indicator — or nothing at all when the run threw a fault
// (that surfaces as the top-level connection banner, never a chat bubble).

import { MessagePrimitive, useMessage } from '@assistant-ui/react'
import { AssistantAnswer } from './AssistantAnswer'
import { CommandAnswer } from './CommandAnswer'
import { readCommand, readResult } from './messageContract'
import { SparkleIcon } from './components/icons'

export function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex flex-col items-end gap-1">
      <span className="pr-1 text-xs font-medium text-muted-foreground">You</span>
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  )
}

export function AssistantMessage() {
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
