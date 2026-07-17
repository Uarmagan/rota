import { AIRPORTS, airportInfo } from './airports'
import { haversineDistanceKm } from './geo'

export function distanceKm(from: string, to: string): number {
  const a = airportInfo(from)
  const b = airportInfo(to)
  return haversineDistanceKm(a, b)
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
