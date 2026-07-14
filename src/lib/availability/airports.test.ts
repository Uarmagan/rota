import { describe, expect, it } from 'vitest'
import { SUPPORTED_PLACES } from '../schema/places'
import { AIRPORTS, airportInfo } from './airports'

describe('airport registry', () => {
  it('covers every supported place exactly once', () => {
    const airportKeys = Object.keys(AIRPORTS).sort()
    const placeKeys = SUPPORTED_PLACES.map(({ iata }) => iata).sort()

    expect(airportKeys).toEqual(placeKeys)
    expect(new Set(airportKeys).size).toBe(airportKeys.length)
  })

  it('returns airport metadata and rejects unknown codes', () => {
    expect(airportInfo('EWR')).toMatchObject({
      iata: 'EWR',
      name: 'Newark Liberty International',
      hub: false,
    })
    expect(() => airportInfo('XXX')).toThrow('Unknown airport XXX')
  })
})
