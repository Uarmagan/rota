import { AIRPORTS } from '../availability/airports'
import { haversineDistanceKm } from '../availability/geo'
import type { NormalizeConfig } from '../engine/normalize'
import { findSupportedPlace, SUPPORTED_PLACES } from '../schema/places'
import type { Place } from '../schema/trip-intent'

export function normalizeConfigFromGeoHeaders(
  headers: Headers,
  fallbackOrigin: Place,
): NormalizeConfig {
  const lat = parseCoordinate(headers.get('x-vercel-ip-latitude'), -90, 90)
  const lon = parseCoordinate(headers.get('x-vercel-ip-longitude'), -180, 180)
  const defaultOrigin =
    lat === null || lon === null
      ? fallbackOrigin
      : resolveOriginFromCoordinates(lat, lon)
  return { defaultOrigin }
}

export function resolveOriginFromCoordinates(lat: number, lon: number): Place {
  const airports = Object.values(AIRPORTS)
  const firstAirport = airports[0]
  if (!firstAirport) throw new Error('Airport registry is empty')
  const coordinates = { lat, lon }

  let nearestAirport = firstAirport
  let nearestDistance = haversineDistanceKm(coordinates, firstAirport)

  for (const airport of airports.slice(1)) {
    const distance = haversineDistanceKm(coordinates, airport)
    if (distance < nearestDistance) {
      nearestAirport = airport
      nearestDistance = distance
    }
  }

  const nearestPlace = findSupportedPlace(nearestAirport.iata)
  if (!nearestPlace) throw new Error(`Unsupported airport ${nearestAirport.iata}`)
  const primaryPlace = SUPPORTED_PLACES.find(
    (place) => place.city === nearestPlace.city,
  )
  if (!primaryPlace) throw new Error(`Unsupported city ${nearestPlace.city}`)

  return { iata: primaryPlace.iata, city: primaryPlace.city }
}

function parseCoordinate(
  value: string | null,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null || value.trim() === '') return null
  const coordinate = Number(value)
  if (!Number.isFinite(coordinate)) return null
  return coordinate >= minimum && coordinate <= maximum ? coordinate : null
}
