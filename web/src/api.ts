import type { AskResult, Fault, Meta, Turn } from './types'

// Runtime-configurable so a future desktop shell (Tauri sidecar) can point the same
// build at a dynamic port. Default '/api' is proxied to Express by Vite in dev.
const API = import.meta.env.VITE_API_URL ?? '/api'

// Thrown for genuine faults (5xx / network) — distinct from the domain outcomes,
// which come back as a normal AskResult. Callers render this as a banner, not a
// chat message (that distinction lands fully in a later slice).
export class SibylFault extends Error {}

export async function ask(question: string, history: Turn[]): Promise<AskResult> {
  let res: Response
  try {
    res = await fetch(`${API}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
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

// Best-effort status-bar metadata; null on any failure (the bar just shows less).
export async function getMeta(): Promise<Meta | null> {
  try {
    const res = await fetch(`${API}/meta`)
    if (!res.ok) return null
    return (await res.json()) as Meta
  } catch {
    return null
  }
}
