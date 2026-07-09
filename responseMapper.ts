// Pure mapping from an engine outcome to an HTTP response shape.
//
// The one rule worth pinning down and testing: all THREE domain outcomes
// (answer, refused, error) are valid results → HTTP 200. Only a genuine fault —
// the model backend unreachable, the DB down, core threw — is a 5xx. Conflating a
// `refused` or an after-retries `error` with an outage would make the client show
// a "server down" banner for a perfectly normal answer.

import type { AskResult } from './core.ts'

export type HttpResponse = { status: number; body: unknown }

// Any AskResult — including kind:'error' — is a 200. It's a result, not a failure.
export function mapResult(result: AskResult): HttpResponse {
  return { status: 200, body: result }
}

// A thrown fault becomes a 5xx with a machine-readable shape the client can tell
// apart from a domain outcome (kind: 'fault').
export function mapFault(error: unknown): HttpResponse {
  const message = error instanceof Error ? error.message : String(error)
  return { status: 503, body: { kind: 'fault', error: message } }
}
