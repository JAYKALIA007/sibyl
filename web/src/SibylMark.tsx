import { useEffect, useRef, useState } from 'react'
import { cn } from './lib/utils'
import type { Stage } from './suggestionStage'

// The Sibyl sparkle, drawn as 8 rays emanating from a hollow centre (matches the
// favicon). Unlike a static icon, this mark *constructs itself* — the rays draw
// outward while the whole sparkle spins into place — then shimmers while it drafts
// questions and blooms (with a one-shot spark burst) when they're ready. Purely
// presentational; the stage is owned by useSuggestionStage.

// Rays in clockwise order (so the staggered draw sweeps around), each from its inner
// (centre-side) point to its outer tip.
const RAYS = [
  'M16 12 L16 7', // up
  'M18.8 13.2 L22.4 9.6', // up-right
  'M20 16 L25 16', // right
  'M18.8 18.8 L22.4 22.4', // down-right
  'M16 20 L16 25', // down
  'M13.2 18.8 L9.6 22.4', // down-left
  'M12 16 L7 16', // left
  'M13.2 13.2 L9.6 9.6', // up-left
]

// The one-shot sparks flung out on "ready" (dx/dy in px from centre).
const SPARKS = [
  { dx: '-17px', dy: '-14px' },
  { dx: '18px', dy: '-11px' },
  { dx: '15px', dy: '16px' },
  { dx: '-15px', dy: '15px' },
]

export function SibylMark({ stage }: { stage: Stage }) {
  // Bumping these keys remounts the animated nodes so their CSS animation replays.
  const [buildId, setBuildId] = useState(1) // construct plays on first mount
  const [bloomId, setBloomId] = useState(0)
  const prev = useRef<Stage>(stage)

  useEffect(() => {
    const was = prev.current
    prev.current = stage
    // Re-construct each time the empty state settles from a fresh load (grace → cook
    // on a cold connection, or grace → revealed on a cache hit).
    if (was === 'grace' && stage !== 'grace') setBuildId((n) => n + 1)
    // Bloom + spark burst the moment questions are ready.
    if (was !== 'ready' && stage === 'ready') setBloomId((n) => n + 1)
  }, [stage])

  return (
    <div
      data-ready={stage === 'ready'}
      className="mark relative flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"
    >
      {stage === 'cooking-2' && <span className="mark-shim" aria-hidden />}
      {bloomId > 0 && <span key={bloomId} className="mark-ring" aria-hidden />}

      <svg viewBox="0 0 32 32" className="mark-svg h-[22px] w-[22px]" aria-hidden>
        <g key={buildId} className="mark-grp">
          {RAYS.map((d, i) => (
            <path key={i} d={d} pathLength={1} className="mark-ray" style={{ ['--i' as string]: i }} />
          ))}
        </g>
      </svg>

      {stage === 'ready' &&
        SPARKS.map((s, i) => (
          <span
            key={`${bloomId}-${i}`}
            className={cn('mark-spark')}
            style={{ ['--dx' as string]: s.dx, ['--dy' as string]: s.dy }}
            aria-hidden
          />
        ))}
    </div>
  )
}
