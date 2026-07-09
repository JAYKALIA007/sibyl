import { useMemo, useRef, type ReactNode } from 'react'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { ask, getSchema, SibylFault } from './api'
import { faultBus } from './faults'
import { deriveHistory, type HistoryMessage } from './history'
import { parseCommand } from './commands'
import type { AskResult, CommandResult } from './types'

type RunMessage = { role: string; content: readonly unknown[]; metadata?: { custom?: unknown } }

function partsText(content: readonly unknown[]): string {
  return (content as { type: string; text?: string }[])
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
    .trim()
}

// Pull the text out of the just-sent user message.
function lastUserText(messages: readonly RunMessage[]): string {
  const last = messages[messages.length - 1]
  return last ? partsText(last.content) : ''
}

// Map assistant-ui thread messages into the normalized shape the (pure) history
// derivation understands. The visual thread stays untouched; this only feeds the
// capped model-context buffer.
function toHistoryMessages(messages: readonly RunMessage[]): HistoryMessage[] {
  return messages.map((m) =>
    m.role === 'assistant'
      ? { role: 'assistant', result: (m.metadata?.custom as { result?: AskResult })?.result ?? null }
      : { role: 'user', text: partsText(m.content) },
  )
}

// A short text fallback (accessibility / non-custom renderers). The rich message
// renders from metadata.custom.result; this text is the plain-words version.
function fallbackText(result: AskResult): string {
  switch (result.kind) {
    case 'answer':
      return result.summary
    case 'refused':
      return `⚠ ${result.reason}`
    case 'error':
      return `✗ Couldn't build a valid query after ${result.attempts} attempt${result.attempts === 1 ? '' : 's'}.`
  }
}

// A content slash command (/schema, /tables, /help) → its rendered result. Runs
// client-side / off /api/schema, bypassing the NL→SQL engine. '/new' is handled in
// the composer (a UI action), so it never reaches here.
async function runCommand(
  kind: 'schema' | 'tables' | 'help',
  connectionId: string,
): Promise<CommandResult> {
  if (kind === 'help') return { kind: 'help' }
  const { ddl, tables } = await getSchema(connectionId)
  return kind === 'schema' ? { kind: 'schema', ddl, tables } : { kind: 'tables', tables }
}

function commandFallbackText(result: CommandResult): string {
  switch (result.kind) {
    case 'help':
      return 'Sibyl commands'
    case 'schema':
      return `Schema — ${result.tables.length} table${result.tables.length === 1 ? '' : 's'}`
    case 'tables':
      return `${result.tables.length} table${result.tables.length === 1 ? '' : 's'}`
  }
}

// The adapter closes over a ref to the active connection id (not a value), so a
// connection switch is reflected on the next run without rebuilding the runtime.
// The thread resets on switch (App), so no in-flight run straddles two DBs.
function makeAdapter(connRef: { current: string | null }): ChatModelAdapter {
  return {
    async run({ messages }) {
      const connectionId = connRef.current
      if (!connectionId) throw new SibylFault('no active connection')

      const question = lastUserText(messages)
      // Capped {question, sql} buffer derived from prior SUCCESSFUL turns only —
      // separate from the visual thread (ADR 0001). The trailing (current) question
      // is naturally excluded (no answer follows it yet).
      const history = deriveHistory(toHistoryMessages(messages))
      const command = parseCommand(question)
      try {
        // Content commands short-circuit the engine and render their own message.
        // They carry `command` (not `result`) in metadata, so deriveHistory — which
        // only reads `result` — never folds them into the model-context buffer.
        if (command && command.kind === 'content') {
          const result = await runCommand(
            command.name.slice(1) as 'schema' | 'tables' | 'help',
            connectionId,
          )
          faultBus.emit(null)
          return {
            content: [{ type: 'text', text: commandFallbackText(result) }],
            metadata: { custom: { command: result } },
          }
        }
        const result = await ask(question, history, connectionId)
        faultBus.emit(null) // a success clears any stale connection banner
        // The full result rides along in metadata.custom; the assistant message reads
        // it to render SQL + table + summary + meter.
        return {
          content: [{ type: 'text', text: fallbackText(result) }],
          metadata: { custom: { result } },
        }
      } catch (e) {
        // A genuine fault (5xx / network) is a connection problem, not a chat message.
        // Surface it as a top-level banner; rethrow so the turn ends with no result
        // (the assistant message renders nothing — see thread.tsx).
        if (e instanceof SibylFault) faultBus.emit(e.message)
        throw e
      }
    },
  }
}

export function SibylRuntimeProvider({
  activeConnectionId,
  children,
}: {
  activeConnectionId: string | null
  children: ReactNode
}) {
  const connRef = useRef(activeConnectionId)
  connRef.current = activeConnectionId
  const adapter = useMemo(() => makeAdapter(connRef), [])
  const runtime = useLocalRuntime(adapter)
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
