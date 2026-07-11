import { describe, expect, it } from 'vitest'
import { connectionCandidates, nonstopMinutes } from './routes'

describe('route shapes', () => {
  it('looks up nonstop block times in either direction', () => {
    expect(nonstopMinutes('ORD', 'NRT')).toBe(780)
    expect(nonstopMinutes('NRT', 'ORD')).toBe(780)
    expect(nonstopMinutes('ORD', 'LIS')).toBeNull()
  })

  it('returns only viable one-stop hubs', () => {
    expect(connectionCandidates('ORD', 'LIS')).toEqual(['JFK', 'LHR', 'CDG'])
    expect(connectionCandidates('ORD', 'ORD')).toEqual([])
  })
})
