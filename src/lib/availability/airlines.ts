import type { AirportInfo } from './airports'

export interface Airline {
  code: string
  name: string
  region: 'na' | 'eu' | 'apac' | 'me' | 'global'
}

export const AIRLINES: readonly Airline[] = [
  { code: 'UA', name: 'United', region: 'na' },
  { code: 'AA', name: 'American', region: 'na' },
  { code: 'DL', name: 'Delta', region: 'na' },
  { code: 'AC', name: 'Air Canada', region: 'na' },
  { code: 'BA', name: 'British Airways', region: 'eu' },
  { code: 'AF', name: 'Air France', region: 'eu' },
  { code: 'KL', name: 'KLM', region: 'eu' },
  { code: 'LH', name: 'Lufthansa', region: 'eu' },
  { code: 'LX', name: 'SWISS', region: 'eu' },
  { code: 'IB', name: 'Iberia', region: 'eu' },
  { code: 'TP', name: 'TAP Air Portugal', region: 'eu' },
  { code: 'TK', name: 'Turkish Airlines', region: 'global' },
  { code: 'EK', name: 'Emirates', region: 'global' },
  { code: 'QR', name: 'Qatar Airways', region: 'global' },
  { code: 'NH', name: 'ANA', region: 'apac' },
  { code: 'JL', name: 'Japan Airlines', region: 'apac' },
  { code: 'SQ', name: 'Singapore Airlines', region: 'apac' },
  { code: 'CX', name: 'Cathay Pacific', region: 'apac' },
]

export function airlinesForRoute(
  from: AirportInfo,
  to: AirportInfo,
): readonly Airline[] {
  const regions = new Set([airportRegion(from), airportRegion(to), 'global'])
  return AIRLINES.filter(({ region }) => regions.has(region))
}

function airportRegion(airport: AirportInfo): Airline['region'] {
  if (airport.lon < -30) return 'na'
  if (airport.lon >= -30 && airport.lon < 25 && airport.lat > 30) return 'eu'
  if (airport.lon >= 25 && airport.lon < 65 && airport.lat > 10) return 'me'
  return 'apac'
}
