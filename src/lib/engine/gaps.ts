import type { TripIntent } from '../schema/trip-intent'

// Pipeline step 5: the PRD's ambiguity policy — at most ONE targeted question, only
// for high-risk gaps. Runs on normalized intents (origin is already filled), so the
// only missing-field gap that blocks a search is the destination. Question copy is a
// deterministic template, never LLM output.
export type GapOutcome =
  | { kind: 'ready' }
  | { kind: 'follow_up'; reason: 'missing_destination'; question: string }

export function checkGaps(intent: TripIntent): GapOutcome {
  if (!intent.destination) {
    return {
      kind: 'follow_up',
      reason: 'missing_destination',
      question: 'Where do you want to fly to?',
    }
  }
  // Contradiction detection joins here once the constraint vocabulary can express a
  // representable contradiction (e.g. a stops field alongside nonstop); with the
  // current field set none exists.
  return { kind: 'ready' }
}
