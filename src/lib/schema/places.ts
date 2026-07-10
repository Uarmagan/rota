import type { Place } from './trip-intent'

// Canonical registry of every place the simulated availability layer knows. The
// parser prompt offers exactly these; the engine's canonicalizePlaces step maps every
// model-emitted IATA code back to its registry entry (discarding model-authored city
// labels, so "Tokyo, Japan" can never diff against "Tokyo") and rejects codes that
// aren't here.
//
// Registry order is the resolution policy: the first entry for a city is the airport
// a bare city name resolves to ("tokyo" -> NRT). Whether multi-airport metros should
// instead use metro codes (TYO) is an open schema question; until decided, NRT
// precedes HND. Grows alongside the simulated availability dataset — bump the version
// when entries change so fixtures pin what they were written against.

export const PLACES_VERSION = '2026-07-09.1'

export const SUPPORTED_PLACES: readonly Place[] = [
  { iata: 'ORD', city: 'Chicago' },
  { iata: 'SFO', city: 'San Francisco' },
  { iata: 'JFK', city: 'New York' },
  { iata: 'NRT', city: 'Tokyo' },
  { iata: 'HND', city: 'Tokyo' },
  { iata: 'LIS', city: 'Lisbon' },
  { iata: 'LHR', city: 'London' },
  { iata: 'CDG', city: 'Paris' },
]

export function findSupportedPlace(iata: string): Place | null {
  return SUPPORTED_PLACES.find((place) => place.iata === iata) ?? null
}
