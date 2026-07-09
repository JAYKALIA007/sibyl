// Minimal inline icon set (stroke-based, 1.5px) so the app pulls in no icon
// dependency. Sized 1em; colour follows currentColor.

type IconProps = { className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: '1em',
  height: '1em',
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="m20 6-11 11-5-5" />
    </svg>
  )
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function SendIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 19V5m0 0-6 6m6-6 6 6" />
    </svg>
  )
}

export function SparkleIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 3v4m0 10v4m9-9h-4M7 12H3m13.5-4.5-2.8 2.8M9.3 14.7l-2.8 2.8m11 0-2.8-2.8M9.3 9.3 6.5 6.5" />
    </svg>
  )
}
