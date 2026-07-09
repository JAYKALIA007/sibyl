import { type ReactNode } from 'react'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { ask, SibylFault } from './api'
import { faultBus } from './faults'
import type { AskResult } from './types'

// Pull the text out of the just-sent user message.
function lastUserText(messages: readonly { role: string; content: readonly unknown[] }[]): string {
  const last = messages[messages.length - 1]
  if (!last) return ''
  return (last.content as { type: string; text?: string }[])
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
    .trim()
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

const adapter: ChatModelAdapter = {
  async run({ messages }) {
    const question = lastUserText(messages)
    try {
      // History threading (window of 3) lands in a later slice; send none for now.
      const result = await ask(question, [])
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

export function SibylRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useLocalRuntime(adapter)
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
