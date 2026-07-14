import { useMemo, useRef, type ReactNode } from 'react'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { askStream, getSchema, runSql, SibylFault } from './api'
import { faultBus } from './faults'
import { deriveHistory, type HistoryMessage } from './history'
import { routeMessage } from './messageRouting'
import { askMeta, commandMeta, streamingMeta, readResult } from './messageContract'
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
      ? { role: 'assistant', result: readResult(m.metadata?.custom) }
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

// `/sql <query>` → a command result. The guard runs server-side; a rejection or DB
// error renders inline (sql-error) rather than throwing a connection fault.
async function runSqlCommand(query: string, connectionId: string): Promise<CommandResult> {
  const outcome = await runSql(query, connectionId)
  switch (outcome.kind) {
    case 'sql':
      return { kind: 'sql', sql: outcome.sql, columns: outcome.columns, rows: outcome.rows }
    case 'rejected':
      return { kind: 'sql-error', message: outcome.reason }
    case 'error':
      return { kind: 'sql-error', message: outcome.error }
  }
}

function commandFallbackText(result: CommandResult): string {
  switch (result.kind) {
    case 'help':
      return 'Sibyl commands'
    case 'schema':
      return `Schema — ${result.tables.length} table${result.tables.length === 1 ? '' : 's'}`
    case 'tables':
      return `${result.tables.length} table${result.tables.length === 1 ? '' : 's'}`
    case 'sql':
      return `${result.rows.length} row${result.rows.length === 1 ? '' : 's'}`
    case 'sql-error':
      return result.message
  }
}

// The adapter closes over refs to the active connection id and selected model (not
// values), so a connection switch or model change is reflected on the next run without
// rebuilding the runtime. The thread resets on switch (App), so no in-flight run
// straddles two DBs.
function makeAdapter(
  connRef: { current: string | null },
  modelRef: { current: string | undefined },
): ChatModelAdapter {
  return {
    async *run({ messages }) {
      const connectionId = connRef.current
      if (!connectionId) throw new SibylFault('no active connection')
      const model = modelRef.current

      const question = lastUserText(messages)
      // Capped {question, sql} buffer derived from prior SUCCESSFUL turns only —
      // separate from the visual thread (ADR 0001). The trailing (current) question
      // is naturally excluded (no answer follows it yet).
      const history = deriveHistory(toHistoryMessages(messages))
      const route = routeMessage(question)
      try {
        // Commands (/sql, /schema, /tables, /help) short-circuit the engine and
        // render their own message. They carry `command` (not `result`) in metadata,
        // so deriveHistory — which only reads `result` — never folds them into the
        // model-context buffer.
        if (route.kind === 'sql' || route.kind === 'command') {
          const result =
            route.kind === 'sql'
              ? await runSqlCommand(route.query, connectionId)
              : await runCommand(route.name as 'schema' | 'tables' | 'help', connectionId)
          faultBus.emit(null)
          yield {
            content: [{ type: 'text' as const, text: commandFallbackText(result) }],
            metadata: { custom: commandMeta(result) },
          }
          return
        }

        // NL→SQL with live token streaming. We bridge the push-based onSqlToken
        // callback into the pull-based async generator using a pendingNotify flag so
        // no notification is lost even if a token arrives before the next await.
        let sqlSoFar = ''
        let done = false
        let finalResult: import('./types').AskResult | null = null
        let streamError: unknown = null
        let pendingNotify = false
        let notifyResolver: (() => void) | null = null

        const notify = () => {
          if (notifyResolver) { notifyResolver(); notifyResolver = null }
          else { pendingNotify = true }
        }
        const waitForUpdate = () => {
          if (pendingNotify) { pendingNotify = false; return Promise.resolve() }
          return new Promise<void>((r) => { notifyResolver = r })
        }

        askStream(question, history, connectionId, {
          onSqlToken: (t) => { sqlSoFar += t; notify() },
          onRetry: () => { sqlSoFar = ''; notify() },
        }, model)
          .then((r) => { finalResult = r; done = true; notify() })
          .catch((e) => { streamError = e; done = true; notify() })

        while (!done) {
          await waitForUpdate()
          if (sqlSoFar) {
            yield {
              content: [{ type: 'text' as const, text: sqlSoFar }],
              metadata: { custom: streamingMeta(sqlSoFar) },
            }
          }
        }

        if (streamError) {
          if (streamError instanceof SibylFault) throw streamError
          throw new SibylFault(`stream error: ${String(streamError)}`)
        }

        faultBus.emit(null)
        yield {
          content: [{ type: 'text' as const, text: fallbackText(finalResult!) }],
          metadata: { custom: askMeta(finalResult!) },
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
  activeModel,
  children,
}: {
  activeConnectionId: string | null
  activeModel: string | undefined
  children: ReactNode
}) {
  const connRef = useRef(activeConnectionId)
  connRef.current = activeConnectionId
  const modelRef = useRef(activeModel)
  modelRef.current = activeModel
  const adapter = useMemo(() => makeAdapter(connRef, modelRef), [])
  const runtime = useLocalRuntime(adapter)
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
