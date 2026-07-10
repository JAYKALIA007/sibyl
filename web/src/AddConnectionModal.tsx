// The add-connection modal: name + URL + a color tag. The server probes the URL
// before saving, so a bad connection surfaces a classified error inline and nothing
// is persisted.

import { useState } from 'react'
import { Modal } from './components/Modal'
import { cn } from './lib/utils'
import { addConnection } from './api'
import type { ConnectionView } from './types'

// A small palette for tagging connections in the rail — enough to tell prod from
// staging from a scratch DB at a glance.
const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#f43f5e', '#8b5cf6', '#64748b']

export function AddConnectionModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: (connection: ConnectionView) => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [color, setColor] = useState<string>(COLORS[0])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!url.trim() || saving) return
    setSaving(true)
    setError(null)
    const result = await addConnection({ name: name.trim() || undefined, url: url.trim(), color })
    setSaving(false)
    if (result.ok) onAdded(result.connection)
    else setError(result.error)
  }

  return (
    <Modal title="Add connection" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Production, Staging, Fantasy WC…"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
        </Field>

        <Field label="Connection URL">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="postgresql://sibyl_ro:…@host:5432/db"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Use a read-only role (e.g. <code className="font-mono">sibyl_ro</code>) — Sibyl only ever reads.
          </p>
        </Field>

        <Field label="Color">
          <div className="flex items-center gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={cn(
                  'h-6 w-6 rounded-full transition-transform',
                  color === c ? 'ring-2 ring-foreground/60 ring-offset-2 ring-offset-card' : 'hover:scale-110',
                )}
              />
            ))}
          </div>
        </Field>

        {error && <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}

        <div className="mt-1 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !url.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Testing…' : 'Test & add'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
