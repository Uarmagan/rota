import { AIRPORTS, airportInfo } from './airports'

const EARTH_RADIUS_KM = 6371

export function distanceKm(from: string, to: string): number {
  const a = airportInfo(from)
  const b = airportInfo(to)
  const latDelta = radians(b.lat - a.lat)
  const lonDelta = radians(b.lon - a.lon)
  const value =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(lonDelta / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export function blockMinutes(from: string, to: string): number {
  return Math.round(((distanceKm(from, to) / 830) * 60 + 45) / 5) * 5
}

export function connectionCandidates(
  origin: string,
  destination: string,
): string[] {
  if (origin === destination) return []
  const directDistance = distanceKm(origin, destination)

  return Object.values(AIRPORTS)
    .filter(({ iata, hub }) => hub && iata !== origin && iata !== destination)
    .map(({ iata }) => ({
      iata,
      distance:
        distanceKm(origin, iata) + distanceKm(iata, destination),
    }))
    .filter(({ distance }) => distance <= directDistance * 1.35)
    .sort((left, right) =>
      left.distance === right.distance
        ? left.iata.localeCompare(right.iata)
        : left.distance - right.distance,
    )
    .slice(0, 4)
    .map(({ iata }) => iata)
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180
}
