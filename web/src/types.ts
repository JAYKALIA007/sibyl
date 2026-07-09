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

// Status-bar metadata (server: GET /api/meta).
export type Meta = { tables: number; model: string; database: string }

// Full schema + per-table row counts (server: GET /api/schema).
export type SchemaTable = { table: string; rows: string }
export type SchemaInfo = { ddl: string; tables: SchemaTable[] }

// Result of a slash command — rendered as an assistant message, but produced
// client-side / from /api/schema, not by the NL→SQL engine (so it never enters the
// model-context history buffer). '/new' is a UI action and has no result.
export type CommandResult =
  | { kind: 'help' }
  | { kind: 'schema'; ddl: string; tables: SchemaTable[] }
  | { kind: 'tables'; tables: SchemaTable[] }
