import type { FlightOption } from '../engine/types'
import type { Cabin, DateWindow, TripIntent } from '../schema/trip-intent'

export interface AvailabilityQuery {
  origin: string
  destination: string
  dates: DateWindow
  travelers: number
}

export interface SourceBatch {
  source: string
  batchIndex: number
  isFinal: boolean
  options: readonly FlightOption[]
}

export interface AvailabilityProvider {
  search(query: AvailabilityQuery): AsyncIterable<SourceBatch>
}

export type DelayFn = (ms: number) => Promise<void>

export interface SourcePersonality {
  id: string
  inventory: readonly [number, number]
  connectionBias: number
  cabinWeights: Readonly<Record<Cabin, number>>
  priceMultiplier: number
  priceJitter: number
  batches: 1 | 2
  firstBatchMs: readonly [number, number]
  interBatchMs: readonly [number, number]
}

export function toAvailabilityQuery(intent: TripIntent): AvailabilityQuery {
  if (intent.origin === null) throw new Error('Missing origin')
  if (intent.destination === null) throw new Error('Missing destination')
  if (intent.dates === null) throw new Error('Missing dates')

  return {
    origin: intent.origin.iata,
    destination: intent.destination.iata,
    dates: intent.dates,
    travelers: intent.travelers ?? 1,
  }
}
