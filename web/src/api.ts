import type { AskResult, ConnectionView, Fault, Meta, SchemaInfo, Setup, Turn } from './types'

// Runtime-configurable so a future desktop shell (Tauri sidecar) can point the same
// build at a dynamic port. Default '/api' is proxied to Express by Vite in dev.
const API = import.meta.env.VITE_API_URL ?? '/api'

// Thrown for genuine faults (5xx / network) — distinct from the domain outcomes,
// which come back as a normal AskResult. Callers render this as a banner, not a
// chat message (that distinction lands fully in a later slice).
export class SibylFault extends Error {}

export async function ask(
  question: string,
  history: Turn[],
  connectionId: string,
): Promise<AskResult> {
  let res: Response
  try {
    res = await fetch(`${API}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history, connectionId }),
    })
  } catch (e) {
    throw new SibylFault(`network error: ${String(e)}`)
  }

  const body = (await res.json().catch(() => null)) as AskResult | Fault | null

  if (!res.ok || (body && 'kind' in body && body.kind === 'fault')) {
    const message = body && 'error' in body ? body.error : `server error ${res.status}`
    throw new SibylFault(message)
  }
  if (!body) throw new SibylFault('empty response from server')
  return body as AskResult
}

// Local-LLM readiness for the onboarding gate. Treats a network failure as
// 'unreachable' (same as the server would) so first-run always has something to show.
export async function getSetup(): Promise<Setup> {
  try {
    const res = await fetch(`${API}/setup`)
    if (!res.ok) throw new Error(`status ${res.status}`)
    return (await res.json()) as Setup
  } catch {
    return { ready: false, reason: 'unreachable', model: 'qwen2.5-coder', pullCommand: 'ollama pull qwen2.5-coder' }
  }
}

// Best-effort status-bar metadata for the active connection; null on any failure
// (the bar just shows less — e.g. a connection that's since gone dead).
export async function getMeta(connectionId: string): Promise<Meta | null> {
  try {
    const res = await fetch(`${API}/meta?connection=${encodeURIComponent(connectionId)}`)
    if (!res.ok) return null
    return (await res.json()) as Meta
  } catch {
    return null
  }
}

// Full schema + row counts for the /schema and /tables commands. Unlike the
// best-effort helpers above, a command is an explicit user action — surface a
// failure as a fault (banner) rather than swallowing it.
export async function getSchema(connectionId: string): Promise<SchemaInfo> {
  let res: Response
  try {
    res = await fetch(`${API}/schema?connection=${encodeURIComponent(connectionId)}`)
  } catch (e) {
    throw new SibylFault(`network error: ${String(e)}`)
  }
  const body = (await res.json().catch(() => null)) as SchemaInfo | Fault | null
  if (!res.ok || !body || 'kind' in body) {
    throw new SibylFault(body && 'error' in body ? body.error : `server error ${res.status}`)
  }
  return body
}

// Raw user SQL via the /sql command — run through the server's read-only guard.
// Outcomes (rows / rejected / db-error) all come back 200; only a genuine fault throws.
export type SqlOutcome =
  | { kind: 'sql'; sql: string; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: 'rejected'; reason: string }
  | { kind: 'error'; error: string }

export async function runSql(sql: string, connectionId: string): Promise<SqlOutcome> {
  let res: Response
  try {
    res = await fetch(`${API}/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, connectionId }),
    })
  } catch (e) {
    throw new SibylFault(`network error: ${String(e)}`)
  }
  const body = (await res.json().catch(() => null)) as SqlOutcome | Fault | null
  if (!res.ok || !body || (body as Fault).kind === 'fault') {
    throw new SibylFault(
      body && 'error' in body ? (body as Fault).error : `server error ${res.status}`,
    )
  }
  return body as SqlOutcome
}

// Schema-aware starter questions for the empty state; [] on failure.
export async function getSuggestions(connectionId: string): Promise<string[]> {
  try {
    const res = await fetch(`${API}/suggestions?connection=${encodeURIComponent(connectionId)}`)
    if (!res.ok) return []
    const body = (await res.json()) as { suggestions?: string[] }
    return Array.isArray(body.suggestions) ? body.suggestions : []
  } catch {
    return []
  }
}

// ── connection registry ──────────────────────────────────────────────────────

export async function listConnections(): Promise<ConnectionView[]> {
  try {
    const res = await fetch(`${API}/connections`)
    if (!res.ok) return []
    return (await res.json()) as ConnectionView[]
  } catch {
    return []
  }
}

// Add a connection. The server probes it first; a failure comes back as a
// classified message (host/auth/SSL/…) which the add-form shows inline.
export async function addConnection(
  input: { name?: string; url: string; color?: string },
): Promise<{ ok: true; connection: ConnectionView; tables: number } | { ok: false; error: string }> {
  let res: Response
  try {
    res = await fetch(`${API}/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch (e) {
    return { ok: false, error: `network error: ${String(e)}` }
  }
  const body = (await res.json().catch(() => null)) as
    | (ConnectionView & { tables: number })
    | Fault
    | null
  if (!res.ok || !body || 'kind' in body) {
    return { ok: false, error: body && 'error' in body ? body.error : `server error ${res.status}` }
  }
  const { tables, ...connection } = body
  return { ok: true, connection, tables }
}

export async function renameConnection(id: string, name: string): Promise<ConnectionView | null> {
  try {
    const res = await fetch(`${API}/connections/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return null
    return (await res.json()) as ConnectionView
  } catch {
    return null
  }
}

export async function deleteConnection(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/connections/${encodeURIComponent(id)}`, { method: 'DELETE' })
    return res.ok
  } catch {
    return false
  }
}
