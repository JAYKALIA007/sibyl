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

let cache: string[] | null = null
let inflight: Promise<string[]> | null = null

// Generate once per process (the schema is fixed for a session) and cache it;
// concurrent callers share the one in-flight request.
export async function getSuggestions(ddl: string): Promise<string[]> {
  if (cache) return cache
  if (!inflight) {
    inflight = (async () => {
      try {
        const raw = await generate(ddl, { system: SYSTEM, temperature: 0.5 })
        const qs = parseSuggestions(raw)
        return qs.length >= 3 ? qs.slice(0, COUNT) : fallbackSuggestions(ddl)
      } catch {
        return fallbackSuggestions(ddl)
      }
    })().then((r) => {
      cache = r
      inflight = null
      return r
    })
  }
  return inflight
}
