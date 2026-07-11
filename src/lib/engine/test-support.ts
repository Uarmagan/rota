import { createEmptyTripIntent } from '../schema/trip-intent'
import type { TripIntent } from '../schema/trip-intent'
import type { FlightOption } from './types'

export function makeOption(
  overrides: Partial<FlightOption> = {},
): FlightOption {
  return {
    id: 'opt-1',
    source: 'src-a',
    cabin: 'economy',
    segments: [
      {
        from: 'SFO',
        to: 'NRT',
        departLocal: '2027-02-10T10:00',
        arriveLocal: '2027-02-11T14:00',
      },
    ],
    totalDurationMinutes: 660,
    pricing: {
      baseMiles: 60_000,
      feesUsd: 40,
      program: 'Aurora Miles',
    },
    ...overrides,
  }
}

export function makeIntent(
  overrides: Partial<TripIntent> = {},
): TripIntent {
  return {
    ...createEmptyTripIntent(),
    ...overrides,
  }
}
