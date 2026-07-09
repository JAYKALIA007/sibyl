import { useState, type FormEvent } from 'react'

// Runtime-configurable so a future desktop shell (Tauri sidecar) can point the same
// build at a dynamic port. Default '/api' is proxied to Express by Vite in dev.
const API = import.meta.env.VITE_API_URL ?? '/api'

export function App() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<unknown>(null)
  const [fault, setFault] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!question.trim() || loading) return
    setLoading(true)
    setFault(null)
    setAnswer(null)
    try {
      const res = await fetch(`${API}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: [] }),
      })
      const body = await res.json()
      if (!res.ok) setFault(`fault ${res.status}: ${(body as { error?: string })?.error ?? 'server error'}`)
      else setAnswer(body)
    } catch (err) {
      setFault(`network error: ${String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ marginBottom: 0 }}>Sibyl</h1>
      <p style={{ color: '#666', marginTop: 4 }}>Ask your database in plain English.</p>

      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="How many users are there?"
          disabled={loading}
          style={{ flex: 1, padding: 8, fontSize: 16 }}
        />
        <button type="submit" disabled={loading} style={{ padding: '8px 16px' }}>
          {loading ? '…' : 'Ask'}
        </button>
      </form>

      {fault && (
        <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{fault}</pre>
      )}
      {answer != null && (
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, overflow: 'auto' }}>
          {JSON.stringify(answer, null, 2)}
        </pre>
      )}
    </main>
  )
}
