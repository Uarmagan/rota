import { describe, expect, it } from 'vitest'
import { AIRLINES, airlinesForRoute } from './airlines'
import { airportInfo } from './airports'

describe('airline route affinity', () => {
  it('defines unique real carrier identities', () => {
    expect(AIRLINES).toHaveLength(18)
    expect(new Set(AIRLINES.map(({ code }) => code)).size).toBe(AIRLINES.length)
    expect(AIRLINES).toContainEqual({
      code: 'NH',
      name: 'ANA',
      region: 'apac',
    })
  })

  it('serves a route from endpoint-region and global carriers', () => {
    const carriers = airlinesForRoute(airportInfo('ORD'), airportInfo('NRT'))

    expect(carriers.some(({ code }) => code === 'UA')).toBe(true)
    expect(carriers.some(({ code }) => code === 'NH')).toBe(true)
    expect(carriers.some(({ code }) => code === 'EK')).toBe(true)
    expect(carriers.some(({ code }) => code === 'BA')).toBe(false)
  })

  it('treats South American airports as part of the Americas affinity', () => {
    const carriers = airlinesForRoute(airportInfo('GRU'), airportInfo('MEX'))

    expect(carriers.some(({ code }) => code === 'AA')).toBe(true)
    expect(carriers.some(({ code }) => code === 'NH')).toBe(false)
  })
})
