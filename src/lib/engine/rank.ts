import type { TripIntent } from '../schema/trip-intent'
import { milesEquivalent } from './pricing'
import type { FlightOption } from './types'

const BASE_PRICE_WEIGHT = 1
const BASE_DURATION_WEIGHT = 0.5
const PRIORITY_MULTIPLIER = 3
const STOPS_WEIGHT = 1
const PREFERRED_CONNECTION_PENALTY = 2

export interface RankedOption {
  readonly option: FlightOption
  readonly score: number
}

export function scoreOption(
  intent: TripIntent,
  option: FlightOption,
): number {
  const priceWeight =
    BASE_PRICE_WEIGHT *
    (intent.priority === 'cheapest' ? PRIORITY_MULTIPLIER : 1)
  const durationWeight =
    BASE_DURATION_WEIGHT *
    (intent.priority === 'fastest' ? PRIORITY_MULTIPLIER : 1)
  const stops = option.segments.length - 1
  const preferredPenalty =
    intent.constraints.nonstop === 'preferred' && stops > 0
      ? PREFERRED_CONNECTION_PENALTY
      : 0

  return (
    priceWeight * (milesEquivalent(option.pricing) / 10_000) +
    durationWeight * (option.totalDurationMinutes / 60) +
    STOPS_WEIGHT * stops +
    preferredPenalty
  )
}

export function rankOptions(
  intent: TripIntent,
  options: readonly FlightOption[],
): readonly RankedOption[] {
  return options
    .map((option) => ({ option, score: scoreOption(intent, option) }))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      if (a.option.id < b.option.id) return -1
      if (a.option.id > b.option.id) return 1
      return 0
    })
}

export function bestMatch(
  ranked: readonly RankedOption[],
): FlightOption | null {
  return ranked[0]?.option ?? null
}
