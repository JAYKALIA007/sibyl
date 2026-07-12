// The empty-thread hero and its suggestion choreography (cook → ready → reveal). The
// pure routing + timings live in suggestionStage.ts; useSuggestionStage here is just
// the timer wiring off the `suggestions` prop (null = generating, [] = failed/empty,
// string[] = ready).

import { useEffect, useRef, useState } from 'react'
import { ThreadPrimitive } from '@assistant-ui/react'
import { cn } from './lib/utils'
import { SibylMark } from './SibylMark'
import { PHASE_COPY, TIMING, resolveTarget, type Stage } from './suggestionStage'

function useSuggestionStage(suggestions: string[] | null): Stage {
  const [stage, setStage] = useState<Stage>(() =>
    suggestions === null ? 'grace' : suggestions.length ? 'revealed' : 'fallback',
  )
  const cookStartRef = useRef(0)
  const loading = suggestions === null

  // (Re)start the choreography each time we enter a load — e.g. a connection switch
  // sets suggestions back to null. Hold off any cooking UI until the grace window
  // elapses, so cache hits (which resolve almost instantly) never show it.
  useEffect(() => {
    if (!loading) return
    setStage('grace')
    cookStartRef.current = 0
    const t = setTimeout(() => {
      cookStartRef.current = Date.now()
      setStage('cooking-1')
    }, TIMING.grace)
    return () => clearTimeout(t)
  }, [loading])

  // cooking-1 → cooking-2.
  useEffect(() => {
    if (stage !== 'cooking-1') return
    const t = setTimeout(() => setStage('cooking-2'), TIMING.phase1)
    return () => clearTimeout(t)
  }, [stage])

  // the "Ready" beat → reveal.
  useEffect(() => {
    if (stage !== 'ready') return
    const t = setTimeout(() => setStage('revealed'), TIMING.ready)
    return () => clearTimeout(t)
  }, [stage])

  // Suggestions resolved — route based on where we are, but never before the minimum
  // cook time (so "Ready" doesn't stutter in on an early resolve).
  useEffect(() => {
    if (suggestions === null) return
    if (stage === 'revealed' || stage === 'fallback' || stage === 'ready') return
    const target = resolveTarget(stage, suggestions)
    if (target === 'revealed') {
      setStage('revealed') // cache hit: straight in, no beat
      return
    }
    const elapsed = cookStartRef.current ? Date.now() - cookStartRef.current : TIMING.minCook
    const remaining = Math.max(0, TIMING.minCook - elapsed)
    const t = setTimeout(() => setStage(target), remaining)
    return () => clearTimeout(t)
  }, [suggestions, stage])

  return stage
}

export function EmptyState({ suggestions }: { suggestions: string[] | null }) {
  const stage = useSuggestionStage(suggestions)

  const subcopy =
    stage === 'cooking-1' || stage === 'cooking-2'
      ? PHASE_COPY[stage]
      : stage === 'ready'
        ? 'Ready'
        : stage === 'fallback'
          ? 'Ask anything about your data — or type / for commands.'
          : 'Plain English in, SQL and answers out.'

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <SibylMark stage={stage} />
      <div>
        <h1 className="text-xl font-semibold">Ask your database</h1>
        <p
          aria-live="polite"
          className={cn(
            'mt-1 text-sm transition-colors',
            stage === 'ready' ? 'font-medium text-primary' : 'text-muted-foreground',
          )}
        >
          {subcopy}
        </p>
      </div>
      {stage === 'revealed' && suggestions && suggestions.length > 0 && (
        <div className="mt-2 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
          {suggestions.map((q, i) => (
            <ThreadPrimitive.Suggestion
              key={q}
              prompt={q}
              send
              style={{ animationDelay: `${i * TIMING.cascadeStep}ms` }}
              className={cn(
                'sibyl-rise rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground/90',
                'transition-colors hover:border-foreground/20 hover:bg-muted',
              )}
            >
              {q}
            </ThreadPrimitive.Suggestion>
          ))}
        </div>
      )}
    </div>
  )
}
