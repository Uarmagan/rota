import { findSupportedPlace } from '../schema/places'
import type { Place, TripIntent } from '../schema/trip-intent'

export class UnknownPlaceError extends Error {
  constructor(readonly iata: string) {
    super(`IATA code not in the supported-place registry: ${iata}`)
    this.name = 'UnknownPlaceError'
  }
}

// Pipeline step 2: map every parser-emitted place to its registry entry, discarding
// model-authored city labels so semantically identical re-emissions stay deep-equal.
// An unknown code rejects the parse — the caller treats it like any other parse
// failure (retry/heal), it never reaches state.
export function canonicalizePlaces(intent: TripIntent): TripIntent {
  return {
    ...intent,
    origin: intent.origin
      ? { ...canonical(intent.origin.iata), assumed: intent.origin.assumed }
      : null,
    destination: intent.destination ? canonical(intent.destination.iata) : null,
  }
}

export interface NormalizeConfig {
  defaultOrigin: Place
}

// Pipeline step 3: the parser never invents an origin; this is the one place an
// assumption enters state, as pure policy.
export function fillAssumptions(
  intent: TripIntent,
  config: NormalizeConfig,
): TripIntent {
  if (intent.origin) return intent
  return {
    ...intent,
    origin: { ...canonical(config.defaultOrigin.iata), assumed: true },
  }
}

function canonical(iata: string): Place {
  const place = findSupportedPlace(iata)
  if (!place) throw new UnknownPlaceError(iata)
  return { iata: place.iata, city: place.city }
}
