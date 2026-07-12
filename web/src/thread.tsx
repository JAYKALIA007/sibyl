// The thread shell: viewport + message list + composer, wired to the assistant-ui
// primitives. The pieces live in their own modules — empty-state choreography
// (EmptyState), message bubbles (ThreadMessages), the input + slash menu (Composer) —
// so this file stays a thin layout.

import { ThreadPrimitive } from '@assistant-ui/react'
import { cn } from './lib/utils'
import { EmptyState } from './EmptyState'
import { Composer } from './Composer'
import { UserMessage, AssistantMessage } from './ThreadMessages'
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
