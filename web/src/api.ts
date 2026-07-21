import type { AskResult, ConnectionView, Fault, Meta, ModelsInfo, SchemaInfo, Setup, Turn } from './types'
import { desktopApiBase } from './surface'

export { isDesktop } from './surface'

// The same build serves both surfaces: desktop injects its sidecar's port (see
// surface.ts), the browser uses same-origin '/api' (Vite proxies it to Express in
// dev). VITE_API_URL stays as a manual escape hatch.
const API = desktopApiBase ?? import.meta.env.VITE_API_URL ?? '/api'

// Thrown for genuine faults (5xx / network) — distinct from the domain outcomes,
// which come back as a normal AskResult. Callers render this as a banner, not a
// chat message (that distinction lands fully in a later slice).
export class SibylFault extends Error {}

export async function ask(
  question: string,
  history: Turn[],
  connectionId: string,
  model?: string,
): Promise<AskResult> {
  let res: Response
  try {
    res = await fetch(`${API}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history, connectionId, model }),
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

// Streaming variant — POSTs the same body as ask() but reads back an SSE stream.
// Fires onSqlToken for each token as the model generates SQL, onRetry on each
// retry attempt, and resolves with the final AskResult.
export type AskStreamCallbacks = {
  onSqlToken?: (token: string) => void
  onRetry?: (attempt: number) => void
}

export async function askStream(
  question: string,
  history: Turn[],
  connectionId: string,
  callbacks: AskStreamCallbacks = {},
  model?: string,
): Promise<AskResult> {
  let res: Response
  try {
    res = await fetch(`${API}/ask/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history, connectionId, model }),
    })
  } catch (e) {
    throw new SibylFault(`network error: ${String(e)}`)
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Fault | null
    throw new SibylFault(body?.error ?? `server error ${res.status}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let finalResult: AskResult | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      let event: { type: string; token?: string; attempt?: number; data?: AskResult; error?: string }
      try {
        event = JSON.parse(line.slice(6))
      } catch {
        continue
      }

      if (event.type === 'sql_token' && event.token !== undefined) {
        callbacks.onSqlToken?.(event.token)
      } else if (event.type === 'retry' && event.attempt !== undefined) {
        callbacks.onRetry?.(event.attempt)
      } else if (event.type === 'result' && event.data) {
        finalResult = event.data
      } else if (event.type === 'error') {
        throw new SibylFault(event.error ?? 'stream error')
      }
    }
  }

  if (!finalResult) throw new SibylFault('stream ended without a result')
  return finalResult
}

// Local-LLM readiness for the onboarding gate. Treats a network failure as
// 'unreachable' (same as the server would) so first-run always has something to show.
// Poll /api/health until the sidecar is listening (needed for desktop: Tauri spawns
// the Node sidecar concurrently with the webview, so the first fetch can race).
// Resolves as soon as health returns 200; gives up after `timeoutMs` and continues
// (getSetup will surface the real error state).
export async function waitForSidecar(timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let delay = 50
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API}/health`)
      if (res.ok) return
    } catch {
      // sidecar not up yet
    }
    await new Promise((r) => setTimeout(r, delay))
    delay = Math.min(delay * 1.5, 500)
  }
}

// The model switcher's data — catalog + installed + default. On any failure returns
// an empty-but-valid shape so the UI degrades to "just the default" rather than erroring.
export async function getModels(): Promise<ModelsInfo> {
  try {
    const res = await fetch(`${API}/models`)
    if (!res.ok) throw new Error(`status ${res.status}`)
    return (await res.json()) as ModelsInfo
  } catch {
    return { active: '', installed: [], catalog: [] }
  }
}

// Pull a catalog model, reading Ollama's download progress back over SSE. Fires
// onProgress for each update and resolves when the pull completes; throws on error.
export type PullProgress = { status: string; total?: number; completed?: number }
export async function pullModel(
  name: string,
  callbacks: { onProgress?: (p: PullProgress) => void } = {},
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${API}/models/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  } catch (e) {
    throw new SibylFault(`network error: ${String(e)}`)
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Fault | null
    throw new SibylFault(body?.error ?? `server error ${res.status}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let done = false

  while (true) {
    const { done: streamDone, value } = await reader.read()
    if (streamDone) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      let event: { type: string; status?: string; total?: number; completed?: number; error?: string }
      try {
        event = JSON.parse(line.slice(6))
      } catch {
        continue
      }
      if (event.type === 'progress' && event.status) {
        callbacks.onProgress?.({ status: event.status, total: event.total, completed: event.completed })
      } else if (event.type === 'done') {
        done = true
      } else if (event.type === 'error') {
        throw new SibylFault(event.error ?? 'pull error')
      }
    }
  }

  if (!done) throw new SibylFault('pull ended without completing')
}

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
