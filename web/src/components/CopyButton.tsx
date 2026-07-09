import { useState } from 'react'
import { cn } from '../lib/utils'
import { CopyIcon, CheckIcon, DownloadIcon } from './icons'

type Variant = 'copy' | 'download'

// A small ghost button that writes `text` to the clipboard and flashes a check
// for ~1.5s. Used for both "copy SQL" and "copy CSV".
export function CopyButton({
  text,
  label,
  copiedLabel = 'Copied',
  variant = 'copy',
  className,
}: {
  text: string
  label: string
  copiedLabel?: string
  variant?: Variant
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function onClick() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked (e.g. non-secure context) — no-op; nothing to recover.
    }
  }

  const Icon = copied ? CheckIcon : variant === 'download' ? DownloadIcon : CopyIcon
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium',
        'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        copied && 'text-emerald-600 hover:text-emerald-600',
        className,
      )}
    >
      <Icon className="text-[13px]" />
      {copied ? copiedLabel : label}
    </button>
  )
}
