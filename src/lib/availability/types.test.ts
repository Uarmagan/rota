import { describe, expect, it } from 'vitest'
import { createEmptyTripIntent } from '../schema/trip-intent'
import { toAvailabilityQuery } from './types'

describe('toAvailabilityQuery', () => {
  it('projects a searchable intent into availability inputs', () => {
    const intent = {
      ...createEmptyTripIntent(),
      travelers: 2,
      origin: { iata: 'ORD', city: 'Chicago', assumed: false },
      destination: { iata: 'NRT', city: 'Tokyo' },
      dates: {
        earliest: '2027-02-10',
        latest: '2027-02-10',
        flexibility: 'exact' as const,
      },
    }

    expect(toAvailabilityQuery(intent)).toEqual({
      origin: 'ORD',
      destination: 'NRT',
      dates: intent.dates,
      travelers: 2,
    })
  })

  it('defaults an unstated traveler count to one', () => {
    expect(toAvailabilityQuery(SEARCHABLE_INTENT).travelers).toBe(1)
  })

  it.each([
    ['origin', { ...SEARCHABLE_INTENT, origin: null }],
    ['destination', { ...SEARCHABLE_INTENT, destination: null }],
    ['dates', { ...SEARCHABLE_INTENT, dates: null }],
  ] as const)('rejects a missing %s', (field, intent) => {
    expect(() => toAvailabilityQuery(intent)).toThrow(`Missing ${field}`)
  })
})

const SEARCHABLE_INTENT = {
  ...createEmptyTripIntent(),
  origin: { iata: 'ORD', city: 'Chicago', assumed: true },
  destination: { iata: 'NRT', city: 'Tokyo' },
  dates: {
    earliest: '2027-02-10',
    latest: '2027-02-10',
    flexibility: 'exact' as const,
  },
}
