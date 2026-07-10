import type { TripIntent } from '../schema/trip-intent'

// Pipeline step 5: the PRD's ambiguity policy — at most ONE targeted question, only
// for high-risk gaps. Runs on normalized intents (origin is already filled), so the
// only missing-field gap that blocks a search is the destination. Question copy is a
// deterministic template, never LLM output.
//
// 'ready_with_notice' is NOT a question: the intent is searchable, so results stream,
// and the parser's echo-only `unhandled` text renders alongside them. That keeps
// "never a wall of questions" true while still surfacing what the parser couldn't map
// (product principle #1). See docs/adr/0002.
export type GapOutcome =
  | { kind: 'ready' }
  | { kind: 'follow_up'; reason: 'missing_destination'; question: string }
  | { kind: 'ready_with_notice'; unhandled: string }

// `unhandled` is the parser's per-utterance notice, passed in beside the intent (it is
// never a field on TripIntent). Missing destination is a hard blocker and is
// adjudicated first: you cannot act on "exactly one connection" before you've said
// where you're going, so the notice waits behind it.
export function checkGaps(intent: TripIntent, unhandled: string | null): GapOutcome {
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
  if (unhandled !== null) {
    return { kind: 'ready_with_notice', unhandled }
  }
  return { kind: 'ready' }
}
