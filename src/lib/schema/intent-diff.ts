import type {
  Cabin,
  Constraints,
  DateWindow,
  Origin,
  Place,
  TripIntent,
} from './trip-intent'

// IntentDiff is NEVER emitted by the LLM. It is computed deterministically by
// src/lib/engine/diff.ts from (previousIntent, newIntent) and exists only to drive
// the UI: which chips appear, change, or disappear. The full TripIntent is state;
// the diff is presentation.

// One entry per chip-level field. Constraints diff individually because each
// constraint is its own chip.
export type IntentFieldValues = {
  travelers: TripIntent['travelers']
  origin: Origin | null
  destination: Place | null
  cabin: Cabin | null
  dates: DateWindow | null
  priority: TripIntent['priority']
  'constraints.nonstop': Constraints['nonstop']
  'constraints.arriveBy': Constraints['arriveBy']
  'constraints.departAfter': Constraints['departAfter']
  'constraints.avoidRedeye': Constraints['avoidRedeye']
  'constraints.avoidLateArrival': Constraints['avoidLateArrival']
}

export type IntentField = keyof IntentFieldValues

// kind is derived: null -> value = 'set', value -> different value = 'changed'
// (deep inequality; an assumed origin being confirmed counts), value -> null =
// 'cleared'. Fields absent from the diff are deep-equal between the two intents.
export type IntentChange<F extends IntentField = IntentField> = {
  [K in F]: {
    field: K
    kind: 'set' | 'changed' | 'cleared'
    previous: IntentFieldValues[K]
    next: IntentFieldValues[K]
  }
}[F]

export type IntentDiff = readonly IntentChange[]
