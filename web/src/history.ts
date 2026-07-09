// Derive the capped model-context buffer (Turn[]) from the conversation.
//
// This is deliberately SEPARATE from the visual thread (ADR 0001): the thread
// shows every message forever, but the model only ever receives the last N
// SUCCESSFUL turns as {question, sql}. Refusals and errors never enter the buffer
// — their SQL is absent or known-bad. Pure and unit-tested.

import type { AskResult, Turn } from './types'

export const HISTORY_WINDOW = 3

// A normalized view of a thread message — the impure glue (runtime.tsx) maps
// assistant-ui messages into this shape so the derivation stays testable.
export type HistoryMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; result: AskResult | null }

export function deriveHistory(
  messages: HistoryMessage[],
  window = HISTORY_WINDOW,
): Turn[] {
  const turns: Turn[] = []
  let pendingQuestion: string | null = null

  for (const m of messages) {
    if (m.role === 'user') {
      pendingQuestion = m.text
    } else if (m.result?.kind === 'answer' && pendingQuestion !== null) {
      turns.push({ question: pendingQuestion, sql: m.result.sql })
      pendingQuestion = null // consumed — don't pair the same question twice
    } else {
      pendingQuestion = null // a refusal/error/empty turn breaks the pairing
    }
  }

  return turns.slice(-window)
}
