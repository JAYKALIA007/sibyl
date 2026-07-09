// The ONLY module that talks to Ollama. Two jobs, two models, two endpoints.
//
// Model swap seam: the chat model is a single constant (overridable via env), so
// swapping the "brain" — e.g. to compare qwen2.5-coder vs llama3.2 vs an API model
// — is a one-line change, and the eval can drive it with SIBYL_CHAT_MODEL.

const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434'

// SQL is a code task → default to a local coder model, not a general one.
export const CHAT_MODEL = process.env.SIBYL_CHAT_MODEL || 'qwen2.5-coder'
export const EMBED_MODEL = process.env.SIBYL_EMBED_MODEL || 'nomic-embed-text'

// Ollama's runtime default context window is only 2048 tokens, regardless of what
// the model actually supports (qwen2.5-coder → 32768). Without setting num_ctx we'd
// silently run at 1/16th of the real window — the schema DDL alone can approach the
// 2048 default. Set it explicitly; override with SIBYL_NUM_CTX.
export const NUM_CTX = Number(process.env.SIBYL_NUM_CTX) || 8192

type GenerateOptions = {
  temperature?: number // 0 = deterministic (used by the eval)
  system?: string
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
      model: CHAT_MODEL,
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
