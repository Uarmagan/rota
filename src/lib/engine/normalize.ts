import {
  findSupportedPlace,
  resolveCountryDestination,
} from '../schema/places'
import type { Cabin, Place, TripIntent } from '../schema/trip-intent'

export const DEFAULT_CABIN: Cabin = 'economy'
export const DEFAULT_TRAVELERS = 1

export class UnknownPlaceError extends Error {
  constructor(readonly iata: string) {
    super(`IATA code not in the supported-place registry: ${iata}`)
    this.name = 'UnknownPlaceError'
  }
}

export class UnknownCountryError extends Error {
  constructor(readonly country: string) {
    super(`Country not in the destination registry: ${country}`)
    this.name = 'UnknownCountryError'
  }
}

// Pipeline step 2: map every parser-emitted place to its registry entry, discarding
// model-authored city labels so semantically identical re-emissions stay deep-equal.
// An unknown code rejects the parse — the caller treats it like any other parse
// failure (feedback retry), it never reaches state.
export function canonicalizePlaces(intent: TripIntent): TripIntent {
  return {
    ...intent,
    origin: intent.origin
      ? { ...canonical(intent.origin.iata), assumed: intent.origin.assumed }
      : null,
    destination:
      intent.destination === null || 'country' in intent.destination
        ? intent.destination
        : {
            ...canonical(intent.destination.iata),
            assumed: intent.destination.assumed,
          },
  }
}

export interface NormalizeConfig {
  defaultOrigin: Place
}

// Pipeline step 3: the parser never invents an origin or resolves a country to a
// place. Assumptions enter state here as pure policy.
export function fillAssumptions(
  intent: TripIntent,
  config: NormalizeConfig,
): TripIntent {
  const origin =
    intent.origin ?? { ...canonical(config.defaultOrigin.iata), assumed: true }
  const destination =
    intent.destination !== null && 'country' in intent.destination
      ? { ...countryDestination(intent.destination.country), assumed: true }
      : intent.destination

  if (origin === intent.origin && destination === intent.destination) return intent
  return {
    ...intent,
    origin,
    destination,
  }
}

// Pipeline step 3: safe near-universal fallbacks render as plain editable chips,
// distinct from the flagged origin assumption.
export function fillDefaults(intent: TripIntent): TripIntent {
  return {
    ...intent,
    cabin: intent.cabin ?? DEFAULT_CABIN,
    travelers: intent.travelers ?? DEFAULT_TRAVELERS,
  }
}

function canonical(iata: string): Place {
  const place = findSupportedPlace(iata)
  if (!place) throw new UnknownPlaceError(iata)
  return { iata: place.iata, city: place.city }
}

function countryDestination(country: string): Place {
  const place = resolveCountryDestination(country)
  if (!place) throw new UnknownCountryError(country)
  return place
}
