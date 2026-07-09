import { type ReactNode } from 'react'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { ask } from './api'
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

// Basic text rendering for this slice — the rich message (table, meter, distinct
// states) arrives in the next slice. Faults (thrown by ask) propagate to the
// runtime's error state; the dedicated fault banner also comes later.
function resultToText(result: AskResult): string {
  switch (result.kind) {
    case 'answer':
      return `${result.summary}\n\n\`\`\`sql\n${result.sql}\n\`\`\``
    case 'refused':
      return `⚠ ${result.reason}`
    case 'error':
      return `✗ Couldn't build a valid query after ${result.attempts} attempt${result.attempts === 1 ? '' : 's'}.\n${result.error}`
  }
}

const adapter: ChatModelAdapter = {
  async run({ messages }) {
    const question = lastUserText(messages)
    // History threading (window of 3) lands in a later slice; send none for now.
    const result = await ask(question, [])
    return { content: [{ type: 'text', text: resultToText(result) }] }
  },
}

export function SibylRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useLocalRuntime(adapter)
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
