import type { Place } from './trip-intent'

// Canonical registry of every place the simulated availability layer knows. The
// parser prompt offers exactly these; the engine's canonicalizePlaces step maps every
// model-emitted IATA code back to its registry entry (discarding model-authored city
// labels, so "Tokyo, Japan" can never diff against "Tokyo") and rejects codes that
// aren't here.
//
// One airport per city for MVP (D3, docs/adr/0003): a bare city name resolves to its
// single registry entry, unambiguously and without an LLM airport choice. Multi-airport
// metros (a "tokyo" -> TYO code the engine expands to member airports at search) are
// deferred to phase 2 — the metro abstraction is disproportionate to a demo where only
// one city ever had two airports. Registry order is still policy should a city ever gain
// a second entry, but nothing currently relies on it. Grows alongside the simulated
// availability dataset — bump the version when entries change so fixtures pin what they
// were written against.

export const PLACES_VERSION = '2026-07-10.1'

export const SUPPORTED_PLACES: readonly Place[] = [
  { iata: 'ORD', city: 'Chicago' },
  { iata: 'SFO', city: 'San Francisco' },
  { iata: 'JFK', city: 'New York' },
  { iata: 'NRT', city: 'Tokyo' },
  { iata: 'LIS', city: 'Lisbon' },
  { iata: 'LHR', city: 'London' },
  { iata: 'CDG', city: 'Paris' },
]

export function findSupportedPlace(iata: string): Place | null {
  return SUPPORTED_PLACES.find((place) => place.iata === iata) ?? null
}
