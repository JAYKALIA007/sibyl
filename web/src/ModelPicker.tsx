// The model switcher — a small dropdown above the composer. Lists the curated coding
// models (installed = selectable, not-installed = a pull affordance) plus any other
// installed models the user brought (off-catalog, flagged "not tested for SQL"). The
// choice is owned by App (persisted to localStorage) and sent with each /api/ask.

import { useEffect, useRef, useState } from 'react'
import { cn } from './lib/utils'
import { CheckIcon, ChevronDownIcon, CopyIcon } from './components/icons'
import type { ModelsInfo } from './types'

// Ollama tags models as `name:tag` (e.g. `qwen2.5-coder:latest`); a bare catalog name
// matches any tag of that model.
function isInstalled(name: string, installed: string[]): boolean {
  return installed.some((m) => m === name || m.split(':')[0] === name)
}

export function ModelPicker({
  models,
  selected,
  onSelect,
}: {
  models: ModelsInfo
  selected: string | undefined
  onSelect: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !e.composedPath().includes(ref.current)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const { catalog, installed, active } = models
  // The effective model: explicit choice, else the server default.
  const effective = selected || active
  const inCatalog = catalog.find((c) => c.name === effective)
  const offCatalog = !inCatalog && !!effective
  const label = inCatalog?.label ?? effective ?? 'model'

  // Installed models the user brought that aren't in our catalog.
  const others = installed.filter(
    (m) => !catalog.some((c) => c.name === m || c.name === m.split(':')[0]),
  )

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Choose the local model"
      >
        {label}
        {offCatalog && <span className="text-amber-500" title="Not tested for SQL (results may vary)">·</span>}
        <ChevronDownIcon className="text-[13px] opacity-70" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="max-h-80 overflow-y-auto p-1">
            <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Coding models
            </p>
            {catalog.map((m) => (
              <CatalogRow
                key={m.name}
                name={m.name}
                label={m.label}
                description={m.description}
                size={m.size}
                installed={isInstalled(m.name, installed)}
                selected={effective === m.name}
                onSelect={() => {
                  onSelect(m.name)
                  setOpen(false)
                }}
              />
            ))}

            {others.length > 0 && (
              <>
                <p className="mt-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Other installed
                </p>
                {others.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      onSelect(m)
                      setOpen(false)
                    }}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center pt-0.5">
                      {effective === m && <CheckIcon className="text-primary" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{m}</span>
                      <span className="block text-[11px] text-amber-600 dark:text-amber-500">
                        Not tested for SQL (results may vary)
                      </span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CatalogRow({
  name,
  label,
  description,
  size,
  installed,
  selected,
  onSelect,
}: {
  name: string
  label: string
  description: string
  size: string
  installed: boolean
  selected: boolean
  onSelect: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copyPull(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(`ollama pull ${name}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 8000)
    } catch {
      // clipboard blocked — the command is still shown in the title
    }
  }

  if (!installed) {
    return (
      <div className="rounded-lg px-2 py-1.5">
        <div className="flex items-start gap-2 opacity-70">
          <span className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">
              {label} <span className="text-[11px] text-muted-foreground">{size}</span>
            </span>
            <span className="block text-[11px] leading-snug text-muted-foreground">{description}</span>
          </span>
          <button
            onClick={copyPull}
            title={`ollama pull ${name}`}
            className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied ? <CheckIcon className="text-primary" /> : <CopyIcon />}
            {copied ? 'Copied' : 'Download'}
          </button>
        </div>
        {copied && (
          <p className="ml-6 mt-1 rounded-md bg-muted px-2 py-1 font-mono text-[11px] leading-snug text-foreground/80">
            ollama pull {name}
            <span className="mt-0.5 block font-sans text-muted-foreground">
              Run this in your terminal to install, then reopen this menu.
            </span>
          </p>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={onSelect}
      className={cn('flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted', selected && 'bg-primary/5')}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center pt-0.5">
        {selected && <CheckIcon className="text-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}
