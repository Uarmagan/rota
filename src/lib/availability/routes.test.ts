import { describe, expect, it } from 'vitest'
import { blockMinutes, connectionCandidates, distanceKm } from './routes'

describe('route shapes', () => {
  it('derives symmetric distances and realistic block times from geometry', () => {
    expect(distanceKm('ORD', 'NRT')).toBeCloseTo(distanceKm('NRT', 'ORD'), 8)
    expect(blockMinutes('ORD', 'NRT')).toBeGreaterThanOrEqual(720)
    expect(blockMinutes('ORD', 'NRT')).toBeLessThanOrEqual(840)
    expect(blockMinutes('JFK', 'LHR')).toBeGreaterThanOrEqual(360)
    expect(blockMinutes('JFK', 'LHR')).toBeLessThanOrEqual(450)
    expect(blockMinutes('SFO', 'LAX')).toBeGreaterThanOrEqual(75)
    expect(blockMinutes('SFO', 'LAX')).toBeLessThanOrEqual(110)
    expect(blockMinutes('JFK', 'LHR')).toBe(blockMinutes('LHR', 'JFK'))
  })

  it('returns detour-bounded one-stop hubs in shortest-detour order', () => {
    const candidates = connectionCandidates('LIS', 'ORD')
    const direct = distanceKm('LIS', 'ORD')
    const detours = candidates.map(
      (hub) => distanceKm('LIS', hub) + distanceKm(hub, 'ORD'),
    )

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.length).toBeLessThanOrEqual(4)
    expect(detours).toEqual([...detours].sort((left, right) => left - right))
    expect(detours.every((distance) => distance <= direct * 1.35)).toBe(true)
    expect(connectionCandidates('ORD', 'ORD')).toEqual([])
  })
})
