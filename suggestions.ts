// Schema-aware starter questions for the empty state. The LLM reads the DDL and
// proposes a few natural questions about THIS database; if that fails we fall back
// to deterministic table-based prompts, so the UI always has something relevant —
// never questions hardcoded for one schema.

import { generate } from './ollama.ts'

const COUNT = 4

const SYSTEM = `You suggest example questions for a natural-language database tool.
Given a SQL schema, output exactly ${COUNT} short, everyday questions a user could ask
about THIS specific data. Cover variety: a simple count, a ranking or "top N", a
relationship across two tables, and a filter. Keep each under 12 words. Return ONLY a
JSON array of ${COUNT} strings — no markdown, no explanation.`

// Pure: pull the model's reply into a clean list of questions. Handles a JSON array
// (preferred) or a bulleted/numbered list (fallback), stripping list markers.
export function parseSuggestions(raw: string): string[] {
  const json = raw.match(/\[[\s\S]*\]/)
  if (json) {
    try {
      const arr = JSON.parse(json[0])
      if (Array.isArray(arr)) {
        const qs = arr.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean)
        if (qs.length) return qs.slice(0, COUNT)
      }
    } catch {
      // not valid JSON — fall through to line parsing
    }
  }
  return raw
    .split('\n')
    .map((l) => l.replace(/^[\s\-*\d.)]+/, '').replace(/^["']|["']$/g, '').trim())
    .filter((l) => l.length > 8)
    .slice(0, COUNT)
}

// Pure: table names from the DDL, in declaration order.
export function tableNames(ddl: string): string[] {
  return [...ddl.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1])
}

// Pure: deterministic questions when the model is unavailable or unparseable.
export function fallbackSuggestions(ddl: string): string[] {
  const tables = tableNames(ddl).slice(0, COUNT)
  if (tables.length === 0) return ['How many rows are in each table?']
  return tables.map((t) => `How many rows are in the ${t} table?`)
}

// Cached per connection (`key`) — with multiple saved DBs, a single global cache
// would serve the first database's questions for every other one. Concurrent
// callers for the same key share the one in-flight request.
const cache = new Map<string, string[]>()
const inflight = new Map<string, Promise<string[]>>()

export async function getSuggestions(ddl: string, key = '__env__'): Promise<string[]> {
  const cached = cache.get(key)
  if (cached) return cached

  let pending = inflight.get(key)
  if (!pending) {
    pending = (async () => {
      try {
        const raw = await generate(ddl, { system: SYSTEM, temperature: 0.5 })
        const qs = parseSuggestions(raw)
        return qs.length >= 3 ? qs.slice(0, COUNT) : fallbackSuggestions(ddl)
      } catch {
        return fallbackSuggestions(ddl)
      }
    })().then((r) => {
      cache.set(key, r)
      inflight.delete(key)
      return r
    })
    inflight.set(key, pending)
  }
  return pending
}
