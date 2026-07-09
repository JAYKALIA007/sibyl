// Client-side mirror of the engine's result contract (server: core.ts / responseMapper.ts).
// Kept in sync by hand — small and stable.

export type Turn = { question: string; sql: string }

export type AskUsage = {
  promptTokens?: number
  outputTokens?: number
  numCtx: number
}

export type AskResult =
  | {
      kind: 'answer'
      sql: string
      rows: Record<string, unknown>[]
      columns: string[]
      summary: string
      attempts: number
      usage: AskUsage
    }
  | { kind: 'refused'; reason: string }
  | { kind: 'error'; sql: string; error: string; attempts: number }

// 5xx fault body (distinct from the three domain outcomes above).
export type Fault = { kind: 'fault'; error: string }
