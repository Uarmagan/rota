import type { TripIntent } from '../schema/trip-intent'

// Pipeline step 5: the product's ambiguity policy — at most ONE targeted ask, only
// for high-risk gaps. Runs on normalized intents (origin is already filled), so the
// only missing-field gap that blocks a search is the destination. The engine reports
// the gap; the UI embodies the ask as an unfilled prompt chip — no question copy is
// composed here or anywhere.
//
// 'ready_with_notice' is NOT a question: the intent is searchable, so results stream,
// and the parser's echo-only `unhandled` text renders alongside them. That keeps
// "never a wall of questions" true while still surfacing what the parser couldn't map
// (product principle #1). See docs/adr/0002.
export type GapOutcome =
  | { kind: 'ready' }
  | { kind: 'follow_up'; reason: 'missing_destination'; unhandled: string | null }
  | { kind: 'ready_with_notice'; unhandled: string }

// `unhandled` is the parser's per-utterance notice, passed in beside the intent (it is
// never a field on TripIntent). Missing destination is a hard blocker and is adjudicated
// first. When both coincide — the common case for an exploratory query like "somewhere
// warm in march" — the follow-up ABSORBS the notice rather than deferring it invisibly
// (D5, docs/adr/0005): the echo renders alongside the destination prompt chip, so the
// line acknowledges what we couldn't use while the chip asks. The echo is the user's
// own words, so no LLM-authored claim reaches the copy.
export function checkGaps(intent: TripIntent, unhandled: string | null): GapOutcome {
  if (!intent.destination) {
    return { kind: 'follow_up', reason: 'missing_destination', unhandled }
  }
  // Contradiction detection joins here once the constraint vocabulary can express a
  // representable contradiction (e.g. a stops field alongside nonstop); with the
  // current field set none exists.
  if (unhandled !== null) {
    return { kind: 'ready_with_notice', unhandled }
  }
  return { kind: 'ready' }
}
