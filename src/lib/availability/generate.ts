import type { FlightOption, FlightSegment } from '../engine/types'
import type { Cabin } from '../schema/trip-intent'
import { drawInt, hashSeed, mulberry32, pickOne, pickWeighted } from './prng'
import type { Random } from './prng'
import { connectionCandidates, nonstopMinutes } from './routes'
import { addMinutes, arrivalLocal } from './time'
import type { AvailabilityQuery, SourcePersonality } from './types'

const DAY_MS = 86_400_000
const CABIN_MILES_MULTIPLIER: Readonly<Record<Cabin, number>> = {
  economy: 1,
  premium_economy: 1.4,
  business: 2.5,
  first: 4,
}
const SEAT_BANDS: Readonly<Record<Cabin, readonly [number, number]>> = {
  economy: [4, 9],
  premium_economy: [2, 5],
  business: [1, 4],
  first: [1, 2],
}
const DEPARTURE_BANDS: readonly {
  value: readonly [number, number]
  weight: number
}[] = [
  { value: [360, 595], weight: 0.3 },
  { value: [600, 955], weight: 0.3 },
  { value: [960, 1255], weight: 0.25 },
  { value: [1260, 1435], weight: 0.15 },
]

export function generateSourceOptions(
  personality: SourcePersonality,
  query: AvailabilityQuery,
  baseSeed: number,
): readonly FlightOption[] {
  return generateSourceOptionsFromRandom(personality, query, sourceRandom(personality, query, baseSeed))
}

export function generateSourceOptionsFromRandom(
  personality: SourcePersonality,
  query: AvailabilityQuery,
  rng: Random,
): readonly FlightOption[] {
  const directMinutes = nonstopMinutes(query.origin, query.destination)
  const connections = connectionCandidates(query.origin, query.destination)
  if (directMinutes === null && connections.length === 0) return []

  const departureDays = sampleDepartureDays(query, rng)
  const targetCount = drawInt(rng, ...personality.inventory)
  const options: FlightOption[] = []

  for (let sequence = 0; sequence < targetCount; sequence += 1) {
    const departureDay = pickOne(rng, departureDays)
    const departLocal = `${departureDay}T${drawDepartureTime(rng)}`
    const cabin = pickWeighted(
      rng,
      Object.entries(personality.cabinWeights).map(([value, weight]) => ({
        value: value as Cabin,
        weight,
      })),
    )
    const segmentsAndDuration = buildItinerary(
      query.origin,
      query.destination,
      departLocal,
      directMinutes,
      connections,
      personality.connectionBias,
      rng,
    )
    const seatsAvailable = drawInt(rng, ...SEAT_BANDS[cabin])
    const pricingJitter = 1 + (rng() * 2 - 1) * personality.milesJitter
    const baseMiles = Math.max(
      7500,
      Math.round(
        ((4000 + segmentsAndDuration.totalDurationMinutes * 55) *
          CABIN_MILES_MULTIPLIER[cabin] *
          personality.milesMultiplier *
          pricingJitter) /
          500,
      ) * 500,
    )
    const option: FlightOption = {
      id: `${personality.id}-${String(sequence).padStart(3, '0')}`,
      source: personality.id,
      cabin,
      segments: segmentsAndDuration.segments,
      totalDurationMinutes: segmentsAndDuration.totalDurationMinutes,
      pricing: {
        baseMiles,
        feesUsd: drawInt(rng, ...personality.feesUsd),
        program: personality.program,
      },
    }

    if (seatsAvailable >= query.travelers) options.push(option)
  }

  return options
}

export function sourceRandom(
  personality: SourcePersonality,
  query: AvailabilityQuery,
  baseSeed: number,
): Random {
  const { origin, destination, dates } = query
  return mulberry32(
    hashSeed(
      `${baseSeed}|${personality.id}|${origin}|${destination}|${dates.earliest}|${dates.latest}`,
    ),
  )
}

function sampleDepartureDays(query: AvailabilityQuery, rng: Random): readonly string[] {
  if (query.dates.flexibility === 'exact') return [query.dates.earliest]

  const start = dateTimestamp(query.dates.earliest)
  const end = dateTimestamp(query.dates.latest)
  const dayCount = Math.floor((end - start) / DAY_MS) + 1
  const offsets = new Set<number>()
  while (offsets.size < Math.min(5, dayCount)) {
    offsets.add(drawInt(rng, 0, dayCount - 1))
  }

  return [...offsets]
    .sort((left, right) => left - right)
    .map((offset) => addMinutes(`${query.dates.earliest}T00:00`, offset * 1440).slice(0, 10))
}

function buildItinerary(
  origin: string,
  destination: string,
  departLocal: string,
  directMinutes: number | null,
  connections: readonly string[],
  connectionBias: number,
  rng: Random,
): { segments: readonly FlightSegment[]; totalDurationMinutes: number } {
  const useConnection =
    directMinutes === null || (connections.length > 0 && rng() < connectionBias)

  if (!useConnection && directMinutes !== null) {
    const duration = jitterDuration(directMinutes, rng)
    return {
      segments: [createSegment(origin, destination, departLocal, duration)],
      totalDurationMinutes: duration,
    }
  }

  const hub = pickOne(rng, connections)
  const firstBase = nonstopMinutes(origin, hub)
  const secondBase = nonstopMinutes(hub, destination)
  if (firstBase === null || secondBase === null) {
    throw new Error(`Invalid connection ${origin}-${hub}-${destination}`)
  }
  const firstDuration = jitterDuration(firstBase, rng)
  const first = createSegment(origin, hub, departLocal, firstDuration)
  const layover = roundToFive(60 + rng() * 120)
  const secondDeparture = addMinutes(first.arriveLocal, layover)
  const secondDuration = jitterDuration(secondBase, rng)
  const second = createSegment(hub, destination, secondDeparture, secondDuration)

  return {
    segments: [first, second],
    totalDurationMinutes: firstDuration + layover + secondDuration,
  }
}

function createSegment(
  from: string,
  to: string,
  departLocal: string,
  durationMinutes: number,
): FlightSegment {
  return {
    from,
    to,
    departLocal,
    arriveLocal: arrivalLocal(departLocal, durationMinutes, from, to),
  }
}

function jitterDuration(baseMinutes: number, rng: Random): number {
  return roundToFive(baseMinutes * (0.95 + rng() * 0.15))
}

function roundToFive(value: number): number {
  return Math.round(value / 5) * 5
}

function drawDepartureTime(rng: Random): string {
  const [start, end] = pickWeighted(rng, DEPARTURE_BANDS)
  const minutes = start + drawInt(rng, 0, (end - start) / 5) * 5
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
    minutes % 60,
  ).padStart(2, '0')}`
}

function dateTimestamp(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}
