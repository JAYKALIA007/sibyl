// The contract for what the runtime attaches to an assistant message's
// `metadata.custom`, and how the thread reads it back. assistant-ui types that field
// as `unknown`, so without a named contract every producer/consumer reached for its
// own `as` cast — a silent seam where a shape change breaks rendering with no
// compiler help. This module is that seam, in one typed place.
//
// A natural-language answer carries `result` (and feeds the capped model-context
// history buffer); a slash-command carries `command` (and never does). Exactly one.

import type { AskResult, CommandResult } from './types'

export type SibylMeta =
  | { result: AskResult; command?: never; streamingSql?: never }
  | { command: CommandResult; result?: never; streamingSql?: never }
  | { streamingSql: string; result?: never; command?: never }

// Producer side (runtime): build the metadata for each message kind.
export function askMeta(result: AskResult): SibylMeta {
  return { result }
}
export function commandMeta(command: CommandResult): SibylMeta {
  return { command }
}
export function streamingMeta(sql: string): SibylMeta {
  return { streamingSql: sql }
}

// Consumer side (thread, history derivation): read one field from the untyped
// boundary. The single unavoidable `as` at the assistant-ui edge lives here, not
// scattered across every call site.
export function readResult(custom: unknown): AskResult | null {
  return (custom as Partial<SibylMeta> | null | undefined)?.result ?? null
}
export function readCommand(custom: unknown): CommandResult | null {
  return (custom as Partial<SibylMeta> | null | undefined)?.command ?? null
}
export function readStreamingSql(custom: unknown): string | null {
  return (custom as Partial<SibylMeta> | null | undefined)?.streamingSql ?? null
}
