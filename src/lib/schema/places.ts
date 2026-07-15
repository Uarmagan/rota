import type { Place } from './trip-intent'

// Canonical registry of every place the simulated availability layer knows. The
// parser prompt offers exactly these; the engine's canonicalizePlaces step maps every
// model-emitted IATA code back to its registry entry (discarding model-authored city
// labels, so "Tokyo, Japan" can never diff against "Tokyo") and rejects codes that
// aren't here.
//
// Registry order resolves bare city names: the first entry for a city is primary,
// while a named airport or IATA code resolves to that specific entry. Grows alongside
// the simulated availability dataset — bump the version when entries change so
// fixtures pin what they were written against.

export const PLACES_VERSION = '2026-07-14.2'

export const SUPPORTED_PLACES = [
  { iata: 'JFK', city: 'New York' },
  { iata: 'LGA', city: 'New York' },
  { iata: 'EWR', city: 'Newark' },
  { iata: 'ORD', city: 'Chicago' },
  { iata: 'MDW', city: 'Chicago' },
  { iata: 'SFO', city: 'San Francisco' },
  { iata: 'OAK', city: 'Oakland' },
  { iata: 'LAX', city: 'Los Angeles' },
  { iata: 'SEA', city: 'Seattle' },
  { iata: 'BOS', city: 'Boston' },
  { iata: 'MIA', city: 'Miami' },
  { iata: 'ATL', city: 'Atlanta' },
  { iata: 'DFW', city: 'Dallas' },
  { iata: 'DEN', city: 'Denver' },
  { iata: 'IAD', city: 'Washington' },
  { iata: 'PHX', city: 'Phoenix' },
  { iata: 'LAS', city: 'Las Vegas' },
  { iata: 'SAN', city: 'San Diego' },
  { iata: 'AUS', city: 'Austin' },
  { iata: 'HNL', city: 'Honolulu' },
  { iata: 'LHR', city: 'London' },
  { iata: 'LGW', city: 'London' },
  { iata: 'STN', city: 'London' },
  { iata: 'CDG', city: 'Paris' },
  { iata: 'ORY', city: 'Paris' },
  { iata: 'AMS', city: 'Amsterdam' },
  { iata: 'FRA', city: 'Frankfurt' },
  { iata: 'MUC', city: 'Munich' },
  { iata: 'ZRH', city: 'Zurich' },
  { iata: 'MAD', city: 'Madrid' },
  { iata: 'BCN', city: 'Barcelona' },
  { iata: 'FCO', city: 'Rome' },
  { iata: 'MXP', city: 'Milan' },
  { iata: 'LIS', city: 'Lisbon' },
  { iata: 'DUB', city: 'Dublin' },
  { iata: 'CPH', city: 'Copenhagen' },
  { iata: 'ARN', city: 'Stockholm' },
  { iata: 'VIE', city: 'Vienna' },
  { iata: 'BER', city: 'Berlin' },
  { iata: 'ATH', city: 'Athens' },
  { iata: 'IST', city: 'Istanbul' },
  { iata: 'NRT', city: 'Tokyo' },
  { iata: 'HND', city: 'Tokyo' },
  { iata: 'KIX', city: 'Osaka' },
  { iata: 'ICN', city: 'Seoul' },
  { iata: 'PEK', city: 'Beijing' },
  { iata: 'PVG', city: 'Shanghai' },
  { iata: 'HKG', city: 'Hong Kong' },
  { iata: 'TPE', city: 'Taipei' },
  { iata: 'SIN', city: 'Singapore' },
  { iata: 'BKK', city: 'Bangkok' },
  { iata: 'DEL', city: 'Delhi' },
  { iata: 'BOM', city: 'Mumbai' },
  { iata: 'SYD', city: 'Sydney' },
  { iata: 'MEL', city: 'Melbourne' },
  { iata: 'AKL', city: 'Auckland' },
  { iata: 'DXB', city: 'Dubai' },
  { iata: 'DOH', city: 'Doha' },
  { iata: 'TLV', city: 'Tel Aviv' },
  { iata: 'GRU', city: 'São Paulo' },
  { iata: 'MEX', city: 'Mexico City' },
  { iata: 'YYZ', city: 'Toronto' },
  { iata: 'YVR', city: 'Vancouver' },
] as const satisfies readonly Place[]

export type SupportedIataCode = (typeof SUPPORTED_PLACES)[number]['iata']
export type AirportAliasMap = Readonly<
  Partial<Record<SupportedIataCode, readonly string[]>>
>

// Parser vocabulary only. Availability owns display names, geometry, and flight
// metadata; these compact spoken forms exist solely to ground language parsing.
export const PLACE_AIRPORT_ALIASES: AirportAliasMap = {
  JFK: ['John F. Kennedy', 'JFK Airport'],
  LGA: ['LaGuardia'],
  EWR: ['Newark Liberty'],
  ORD: ["O'Hare", "Chicago O'Hare"],
  MDW: ['Midway', 'Chicago Midway'],
  SFO: ['San Francisco International'],
  OAK: ['Oakland', 'Oakland International'],
  LHR: ['Heathrow', 'London Heathrow'],
  LGW: ['Gatwick', 'London Gatwick'],
  STN: ['Stansted', 'London Stansted'],
  CDG: ['Charles de Gaulle', 'Paris Charles de Gaulle'],
  ORY: ['Orly', 'Paris Orly'],
  NRT: ['Narita', 'Tokyo Narita'],
  HND: ['Haneda', 'Tokyo Haneda'],
} as const satisfies AirportAliasMap

export function airportAliasesForPlaces(
  places: readonly Place[],
): AirportAliasMap {
  const aliases = places.flatMap((place) => {
    const names = PLACE_AIRPORT_ALIASES[place.iata as SupportedIataCode]
    return names ? [[place.iata, names] as const] : []
  })
  return Object.freeze(Object.fromEntries(aliases)) as AirportAliasMap
}

export function findSupportedPlace(iata: string): Place | null {
  return SUPPORTED_PLACES.find((place) => place.iata === iata) ?? null
}
