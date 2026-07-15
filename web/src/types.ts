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

// The model switcher's data (server: GET /api/models). `catalog` is the curated,
// tested-for-SQL set; `installed` is what Ollama actually has pulled; `active` is the
// server default. A catalog entry not in `installed` needs pulling; an `installed`
// name not in `catalog` is an off-catalog model (selectable, "not tested" note).
export type CatalogModel = { name: string; label: string; description: string; size: string }
export type ModelsInfo = { active: string; installed: string[]; catalog: CatalogModel[] }

// First-run readiness of the local LLM (server: GET /api/setup). Backs the
// onboarding flow — 'unreachable' = Ollama not installed/running, 'model-missing'
// = installed but the chat model isn't pulled yet.
export type Setup =
  | { ready: true; model: string }
  | { ready: false; reason: 'unreachable' | 'model-missing'; model: string; pullCommand: string }

// A saved connection as the client sees it — never the raw URL (server: the
// connection registry). `label` is the password-free user@host/db.
export type ConnectionView = { id: string; name: string; label: string; color?: string }

// Full schema + per-table row counts (server: GET /api/schema).
export type SchemaTable = { table: string; rows: string }
export type SchemaInfo = { ddl: string; tables: SchemaTable[] }

// Result of a slash command — rendered as an assistant message, but produced
// client-side / from /api/schema (or /api/sql), not by the NL→SQL engine (so it
// never enters the model-context history buffer). '/new' is a UI action, no result.
export type CommandResult =
  | { kind: 'help' }
  | { kind: 'schema'; ddl: string; tables: SchemaTable[] }
  | { kind: 'tables'; tables: SchemaTable[] }
  | { kind: 'sql'; sql: string; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: 'sql-error'; message: string }
