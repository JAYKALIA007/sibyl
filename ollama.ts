// The ONLY module that talks to Ollama. Two jobs, two models, two endpoints.
//
// Model swap seam: the chat model is a single constant (overridable via env), so
// swapping the "brain" — e.g. to compare qwen2.5-coder vs llama3.2 vs an API model
// — is a one-line change, and the eval can drive it with SIBYL_CHAT_MODEL.

import { isMain } from './isMain.ts'

const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434'

// SQL is a code task → default to a local coder model, not a general one.
export const CHAT_MODEL = process.env.SIBYL_CHAT_MODEL || 'qwen2.5-coder'
export const EMBED_MODEL = process.env.SIBYL_EMBED_MODEL || 'nomic-embed-text'

// The curated set of local coding models we recommend + have tested for SQL. The
// switcher shows these; a user can still run any other installed model (off-catalog,
// surfaced with a "not tested" note). All are pullable via Ollama.
export type CatalogModel = { name: string; label: string; description: string; size: string }
export const MODEL_CATALOG: CatalogModel[] = [
  { name: 'qwen2.5-coder', label: 'Qwen2.5 Coder', description: 'Default. Strong, proven SQL generation; scales down to 8 GB.', size: '~4.7 GB' },
  { name: 'qwen3-coder', label: 'Qwen3 Coder', description: "2026's best-in-class local coder. Needs ~16 GB.", size: '~9-12 GB' },
  { name: 'deepseek-coder-v2', label: 'DeepSeek Coder V2', description: 'Strong reasoning; shines on gnarly multi-join / subquery SQL.', size: '~9 GB' },
  { name: 'codestral', label: 'Codestral', description: "Mistral's dedicated 22B coder. Needs ~16 GB VRAM.", size: '~13 GB' },
  { name: 'llama3.1', label: 'Llama 3.1', description: 'Popular general model, the one most people already have.', size: '~4.9 GB' },
]

// Ollama's runtime default context window is only 2048 tokens, regardless of what
// the model actually supports (qwen2.5-coder → 32768). Without setting num_ctx we'd
// silently run at 1/16th of the real window — the schema DDL alone can approach the
// 2048 default. Set it explicitly; override with SIBYL_NUM_CTX.
export const NUM_CTX = Number(process.env.SIBYL_NUM_CTX) || 8192

export { OLLAMA }

type GenerateOptions = {
  temperature?: number // 0 = deterministic (used by the eval)
  system?: string
  model?: string // per-request override of CHAT_MODEL (the switcher); defaults to it
}

// Is `wanted` among the pulled models? Ollama tags models as `name:tag` (e.g.
// `qwen2.5-coder:latest`); our CHAT_MODEL is usually the bare name, so an untagged
// request matches any tag of that model. Pure — unit-tested.
export function hasModel(available: string[], wanted: string): boolean {
  if (available.includes(wanted)) return true
  if (wanted.includes(':')) return false
  return available.some((m) => m.split(':')[0] === wanted)
}

export type OllamaStatus =
  | { ok: true; models: string[] }
  | { ok: false; reason: 'unreachable'; error: string }
  | { ok: false; reason: 'model-missing'; model: string; models: string[] }

// The pulled models Ollama reports, bare names (e.g. `qwen2.5-coder:latest`). Throws
// on an unreachable Ollama so callers can distinguish "none installed" from "down".
export async function listInstalledModels(): Promise<string[]> {
  const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { models?: { name: string }[] }
  return (data.models ?? []).map((m) => m.name)
}

// Preflight: is Ollama up and is the chat model pulled? Callers turn this into
// actionable guidance instead of a raw fetch error deep in the first question.
export async function checkOllama(): Promise<OllamaStatus> {
  let models: string[]
  try {
    models = await listInstalledModels()
  } catch (e) {
    return { ok: false, reason: 'unreachable', error: (e as Error).message }
  }
  if (!hasModel(models, CHAT_MODEL)) {
    return { ok: false, reason: 'model-missing', model: CHAT_MODEL, models }
  }
  return { ok: true, models }
}

// Real token counts Ollama returns on every non-streaming completion:
//   promptTokens = the whole input (system + schema + history + question)
//   outputTokens = what the model generated
// Undefined if the server omits them (older Ollama); callers degrade gracefully.
export type Usage = { promptTokens?: number; outputTokens?: number }

// Ask the chat model for a completion, returning the text AND token usage.
export async function generateWithUsage(
  prompt: string,
  opts: GenerateOptions = {}
): Promise<{ text: string; usage: Usage }> {
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model || CHAT_MODEL,
      prompt,
      system: opts.system,
      stream: false,
      options: {
        num_ctx: NUM_CTX,
        ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
      },
    }),
  })
  if (!res.ok) throw new Error(`generate failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as {
    response: string
    prompt_eval_count?: number
    eval_count?: number
  }
  return {
    text: data.response,
    usage: { promptTokens: data.prompt_eval_count, outputTokens: data.eval_count },
  }
}

// Text-only convenience for callers that don't care about token usage.
export async function generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const { text } = await generateWithUsage(prompt, opts)
  return text
}

// Streaming variant — calls onToken for each chunk as it arrives, then returns the
// full text + usage. Uses a 9-char lookahead buffer so the NO_ANSWER sentinel is
// never forwarded to onToken; callers see tokens only for real SQL responses.
export async function generateStream(
  prompt: string,
  opts: GenerateOptions & { onToken: (chunk: string) => void }
): Promise<{ text: string; usage: Usage }> {
  const NO_ANSWER_SENTINEL = 'NO_ANSWER' // 9 chars
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model || CHAT_MODEL,
      prompt,
      system: opts.system,
      stream: true,
      options: {
        num_ctx: NUM_CTX,
        ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
      },
    }),
  })
  if (!res.ok) throw new Error(`generate failed: ${res.status} ${await res.text()}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let rawBuf = '' // partial NDJSON lines between read() calls
  let fullText = ''
  let usage: Usage = {}

  // Accumulate in lookahead until we have enough chars to rule out NO_ANSWER.
  // Once ruled out, stream remaining tokens directly to onToken.
  let lookahead = ''
  let sentinelRuledOut = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    rawBuf += decoder.decode(value, { stream: true })
    const lines = rawBuf.split('\n')
    rawBuf = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      let chunk: { response: string; done: boolean; prompt_eval_count?: number; eval_count?: number }
      try {
        chunk = JSON.parse(line)
      } catch {
        continue
      }

      fullText += chunk.response

      if (chunk.done) {
        usage = { promptTokens: chunk.prompt_eval_count, outputTokens: chunk.eval_count }
        // Flush remaining lookahead if the model finished before we could rule out the sentinel
        // (e.g. very short response). Suppress if it is the sentinel.
        if (!sentinelRuledOut && lookahead.trim() !== NO_ANSWER_SENTINEL) {
          opts.onToken(lookahead)
        }
        continue
      }

      if (sentinelRuledOut) {
        opts.onToken(chunk.response)
        continue
      }

      lookahead += chunk.response
      if (lookahead.trimStart().length >= NO_ANSWER_SENTINEL.length) {
        sentinelRuledOut = true
        if (!lookahead.trimStart().startsWith(NO_ANSWER_SENTINEL)) {
          opts.onToken(lookahead)
        }
        // Starts with NO_ANSWER → suppress; sentinel is never forwarded.
      }
    }
  }

  return { text: fullText.trim(), usage }
}

// Turn text into a meaning-vector. Not needed for v1 SQL generation, but the seam
// is here for schema-RAG later (retrieving only relevant tables on huge schemas).
export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  })
  if (!res.ok) throw new Error(`embed failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { embedding: number[] }
  return data.embedding
}

// One progress update from a model pull. `total`/`completed` are per-layer byte
// counts (Ollama pulls layer by layer), so they reset as each layer starts.
export type PullProgress = { status: string; total?: number; completed?: number }

// Pull a model via Ollama, streaming progress to onProgress. Resolves when the pull
// finishes (Ollama's final `status: success`), throws on an error line or HTTP error.
// Ollama caches partial layers, so a re-pull after a disconnect resumes.
export async function pullModel(
  name: string,
  onProgress: (p: PullProgress) => void
): Promise<void> {
  const res = await fetch(`${OLLAMA}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name, stream: true }),
  })
  if (!res.ok) throw new Error(`pull failed: ${res.status} ${await res.text()}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      let chunk: { status?: string; error?: string; total?: number; completed?: number }
      try {
        chunk = JSON.parse(line)
      } catch {
        continue
      }
      if (chunk.error) throw new Error(chunk.error)
      if (chunk.status) {
        onProgress({ status: chunk.status, total: chunk.total, completed: chunk.completed })
      }
    }
  }
}

// Self-test: `npm run ollama:check` — proves both endpoints work before anything else.
if (isMain(import.meta.url)) {
  console.log(`chat model:  ${CHAT_MODEL}`)
  console.log(`embed model: ${EMBED_MODEL}\n`)

  const vec = await embed('hello world')
  console.log(`embed ok  → vector length ${vec.length}, first 3: [${vec.slice(0, 3).map((n) => n.toFixed(3)).join(', ')}]`)

  const reply = await generate('In one short sentence, what is a SQL JOIN?', { temperature: 0 })
  console.log(`generate ok → ${reply.trim()}`)
}
