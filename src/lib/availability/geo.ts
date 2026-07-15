const EARTH_RADIUS_KM = 6371

export interface Coordinates {
  lat: number
  lon: number
}

export function haversineDistanceKm(
  from: Coordinates,
  to: Coordinates,
): number {
  const latDelta = radians(to.lat - from.lat)
  const lonDelta = radians(to.lon - from.lon)
  const value =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(from.lat)) *
      Math.cos(radians(to.lat)) *
      Math.sin(lonDelta / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180
}
