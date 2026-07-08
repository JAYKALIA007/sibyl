// The ONLY module that talks to Ollama. Two jobs, two models, two endpoints.
//
// Model swap seam: the chat model is a single constant (overridable via env), so
// swapping the "brain" — e.g. to compare qwen2.5-coder vs llama3.2 vs an API model
// — is a one-line change, and the eval can drive it with SIBYL_CHAT_MODEL.

const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434'

// SQL is a code task → default to a local coder model, not a general one.
export const CHAT_MODEL = process.env.SIBYL_CHAT_MODEL || 'qwen2.5-coder'
export const EMBED_MODEL = process.env.SIBYL_EMBED_MODEL || 'nomic-embed-text'

type GenerateOptions = {
  temperature?: number // 0 = deterministic (used by the eval)
  system?: string
}

// Ask the chat model for a completion. Non-streaming (we want the whole SQL/answer).
export async function generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      prompt,
      system: opts.system,
      stream: false,
      options: opts.temperature === undefined ? undefined : { temperature: opts.temperature },
    }),
  })
  if (!res.ok) throw new Error(`generate failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { response: string }
  return data.response
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

// Self-test: `npm run ollama:check` — proves both endpoints work before anything else.
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`chat model:  ${CHAT_MODEL}`)
  console.log(`embed model: ${EMBED_MODEL}\n`)

  const vec = await embed('hello world')
  console.log(`embed ok  → vector length ${vec.length}, first 3: [${vec.slice(0, 3).map((n) => n.toFixed(3)).join(', ')}]`)

  const reply = await generate('In one short sentence, what is a SQL JOIN?', { temperature: 0 })
  console.log(`generate ok → ${reply.trim()}`)
}
