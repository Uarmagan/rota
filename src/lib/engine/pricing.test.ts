import { describe, expect, it } from 'vitest'
import { computeAwardPrice, milesEquivalent } from './pricing'

const pricing = {
  baseMiles: 60_000,
  feesUsd: 40,
  program: 'Aurora Miles',
}

describe('computeAwardPrice', () => {
  it('returns one-traveler display totals', () => {
    expect(computeAwardPrice(pricing, 1)).toEqual({
      totalMiles: 60_000,
      totalFeesUsd: 40,
      program: 'Aurora Miles',
    })
  })

  it('multiplies miles and fees for the whole party', () => {
    expect(computeAwardPrice(pricing, 4)).toEqual({
      totalMiles: 240_000,
      totalFeesUsd: 160,
      program: 'Aurora Miles',
    })
  })
})

describe('milesEquivalent', () => {
  it('converts fees through the fixed price scalar', () => {
    expect(milesEquivalent(pricing)).toBe(63_200)
  })
})
