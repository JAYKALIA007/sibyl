// The choreography for the empty-state starter questions: cook → ready → reveal,
// driven purely by the `suggestions: null → string[]` prop. This file holds the
// PURE parts (stages, timings, the routing decision) so the tricky branch points are
// unit-testable in isolation; the timer wiring lives in the useSuggestionStage hook.

export type Stage =
  | 'grace' // brief wait before committing to cook — cache hits fade straight in
  | 'cooking-1' // "Reading your schema…"
  | 'cooking-2' // "Cooking up good questions…"
  | 'ready' // the earned "Ready" confirmation beat
  | 'revealed' // questions shown (cascade in)
  | 'fallback' // empty result — calm rest, no cards, no celebration

// All timings in ms. Tuned so: cache hits (resolve < grace) never show cooking;
// cooking-2 is guaranteed a beat even on an early resolve (minCook > grace+phase1);
// and "Ready" holds long enough to register without gating.
export const TIMING = {
  grace: 300, // show no cooking UI until we've been loading this long
  phase1: 1300, // cooking-1 → cooking-2
  minCook: 1600, // min cook time (from cook start) before the ready/fallback beat
  ready: 520, // "Ready" hold → revealed
  cascadeStep: 55, // per-card stagger on reveal
} as const

export const PHASE_COPY: Record<'cooking-1' | 'cooking-2', string> = {
  'cooking-1': 'Reading your schema…',
  'cooking-2': 'Cooking up good questions…',
}

// The crux of the choreography: when suggestions resolve, where do we go?
//   - empty result          → 'fallback' (never celebrate nothing)
//   - resolved within grace  → 'revealed' (cache hit: skip the cooking theatre)
//   - resolved mid-cook      → 'ready'    (earn the confirmation beat)
export function resolveTarget(
  stageAtResolve: Stage,
  suggestions: string[],
): 'revealed' | 'ready' | 'fallback' {
  if (suggestions.length === 0) return 'fallback'
  if (stageAtResolve === 'grace') return 'revealed'
  return 'ready'
}
