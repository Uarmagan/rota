import type {
  IntentChange,
  IntentDiff,
  IntentField,
  IntentFieldValues,
} from '../schema/intent-diff'
import type { TripIntent } from '../schema/trip-intent'

type FieldGetters = {
  [F in IntentField]: (intent: TripIntent) => IntentFieldValues[F]
}

const getters: FieldGetters = {
  travelers: (i) => i.travelers,
  origin: (i) => i.origin,
  destination: (i) => i.destination,
  cabin: (i) => i.cabin,
  dates: (i) => i.dates,
  priority: (i) => i.priority,
  'constraints.nonstop': (i) => i.constraints.nonstop,
  'constraints.arriveBy': (i) => i.constraints.arriveBy,
  'constraints.departAfter': (i) => i.constraints.departAfter,
  'constraints.avoidRedeye': (i) => i.constraints.avoidRedeye,
  'constraints.avoidLateArrival': (i) => i.constraints.avoidLateArrival,
}

export const INTENT_FIELDS = Object.keys(getters) as readonly IntentField[]

// Pipeline step 4. Both inputs must be normalized intents — canonicalization is what
// makes deep-equality a fair test (see engine/normalize.ts).
export function computeIntentDiff(prev: TripIntent, next: TripIntent): IntentDiff {
  const changes: IntentChange[] = []
  for (const field of INTENT_FIELDS) {
    const previous = getters[field](prev)
    const nextValue = getters[field](next)
    if (deepEqual(previous, nextValue)) continue
    changes.push({
      field,
      kind: previous === null ? 'set' : nextValue === null ? 'cleared' : 'changed',
      previous,
      next: nextValue,
    } as IntentChange)
  }
  return changes
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false
  }
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  )
}
