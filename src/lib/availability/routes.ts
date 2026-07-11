export const NONSTOP_BLOCK_MINUTES: Readonly<Record<string, number>> = {
  'CDG-LHR': 80,
  'CDG-LIS': 150,
  'CDG-NRT': 760,
  'CDG-ORD': 495,
  'CDG-SFO': 640,
  'JFK-CDG': 440,
  'JFK-LHR': 415,
  'JFK-LIS': 400,
  'JFK-NRT': 840,
  'JFK-ORD': 135,
  'JFK-SFO': 330,
  'LHR-LIS': 155,
  'LHR-NRT': 780,
  'LHR-ORD': 470,
  'LHR-SFO': 620,
  'NRT-ORD': 780,
  'NRT-SFO': 660,
  'ORD-SFO': 270,
}

export const HUBS = ['ORD', 'JFK', 'LHR', 'CDG'] as const

function routeKey(from: string, to: string): string {
  return [from, to].sort().join('-')
}

export function nonstopMinutes(from: string, to: string): number | null {
  return NONSTOP_BLOCK_MINUTES[routeKey(from, to)] ?? null
}

export function connectionCandidates(from: string, to: string): readonly string[] {
  if (from === to) return []
  return HUBS.filter(
    (hub) =>
      hub !== from &&
      hub !== to &&
      nonstopMinutes(from, hub) !== null &&
      nonstopMinutes(hub, to) !== null,
  )
}
