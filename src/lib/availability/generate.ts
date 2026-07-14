import type { FlightOption, FlightSegment } from '../engine/types'
import type { Cabin } from '../schema/trip-intent'
import { airlinesForRoute, type Airline } from './airlines'
import { airportInfo } from './airports'
import { drawInt, hashSeed, mulberry32, pickOne, pickWeighted } from './prng'
import type { Random } from './prng'
import { blockMinutes, connectionCandidates, distanceKm } from './routes'
import { addMinutes, arrivalLocal } from './time'
import type { AvailabilityQuery, SourcePersonality } from './types'

const DAY_MS = 86_400_000
const CABIN_PRICE_MULTIPLIER: Readonly<Record<Cabin, number>> = {
  economy: 1,
  premium_economy: 1.6,
  business: 3.2,
  first: 5,
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
  return generateSourceOptionsFromRandom(
    personality,
    query,
    sourceRandom(personality, query, baseSeed),
  )
}

export function generateSourceOptionsFromRandom(
  personality: SourcePersonality,
  query: AvailabilityQuery,
  rng: Random,
): readonly FlightOption[] {
  if (query.origin === query.destination) return []
  const connections = connectionCandidates(query.origin, query.destination)
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
    const itinerary = buildItinerary(
      query.origin,
      query.destination,
      departLocal,
      connections,
      personality.connectionBias,
      rng,
    )
    const seatsAvailable = drawInt(rng, ...SEAT_BANDS[cabin])
    const jitter = 1 + (rng() * 2 - 1) * personality.priceJitter
    const connectionDiscount = itinerary.segments.length > 1
      ? 0.75 + rng() * 0.15
      : 1
    const priceUsd = Math.round(
      (80 + distanceKm(query.origin, query.destination) * 0.085) *
        CABIN_PRICE_MULTIPLIER[cabin] *
        personality.priceMultiplier *
        jitter *
        connectionDiscount,
    )
    const option: FlightOption = {
      id: `${personality.id}-${String(sequence).padStart(3, '0')}`,
      source: personality.id,
      cabin,
      segments: itinerary.segments,
      totalDurationMinutes: itinerary.totalDurationMinutes,
      pricing: { priceUsd },
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
  connections: readonly string[],
  connectionBias: number,
  rng: Random,
): { segments: readonly FlightSegment[]; totalDurationMinutes: number } {
  const useConnection = connections.length > 0 && rng() < connectionBias

  if (!useConnection) {
    const duration = blockMinutes(origin, destination)
    const airline = pickOne(
      rng,
      airlinesForRoute(airportInfo(origin), airportInfo(destination)),
    )
    return {
      segments: [
        createSegment(origin, destination, departLocal, duration, airline, rng),
      ],
      totalDurationMinutes: duration,
    }
  }

  const hub = pickOne(rng, connections)
  const [firstAirline, secondAirline] = connectionAirlines(
    origin,
    hub,
    destination,
    rng,
  )
  const firstDuration = blockMinutes(origin, hub)
  const first = createSegment(
    origin,
    hub,
    departLocal,
    firstDuration,
    firstAirline,
    rng,
  )
  const layover = roundToFive(60 + rng() * 120)
  const secondDeparture = addMinutes(first.arriveLocal, layover)
  const secondDuration = blockMinutes(hub, destination)
  const second = createSegment(
    hub,
    destination,
    secondDeparture,
    secondDuration,
    secondAirline,
    rng,
  )

  return {
    segments: [first, second],
    totalDurationMinutes: firstDuration + layover + secondDuration,
  }
}

function connectionAirlines(
  origin: string,
  hub: string,
  destination: string,
  rng: Random,
): readonly [Airline, Airline] {
  const first = airlinesForRoute(airportInfo(origin), airportInfo(hub))
  const second = airlinesForRoute(airportInfo(hub), airportInfo(destination))
  const shared = first.filter((airline) =>
    second.some(({ code }) => code === airline.code),
  )

  if (rng() < 0.8) {
    const airline = pickOne(rng, shared)
    return [airline, airline]
  }
  return [pickOne(rng, first), pickOne(rng, second)]
}

function createSegment(
  from: string,
  to: string,
  departLocal: string,
  durationMinutes: number,
  airline: Airline,
  rng: Random,
): FlightSegment {
  return {
    from,
    to,
    departLocal,
    arriveLocal: arrivalLocal(departLocal, durationMinutes, from, to),
    flight: `${airline.code} ${drawInt(rng, 1, 1999)}`,
  }
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
