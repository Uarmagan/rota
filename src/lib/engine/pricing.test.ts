import { describe, expect, it } from 'vitest'
import { computePartyPrice } from './pricing'

describe('computePartyPrice', () => {
  it('returns one-traveler cash price', () => {
    expect(computePartyPrice({ priceUsd: 620 }, 1)).toEqual({ totalUsd: 620 })
  })

  it('multiplies the per-traveler fare for the whole party', () => {
    expect(computePartyPrice({ priceUsd: 620 }, 4)).toEqual({ totalUsd: 2480 })
  })
})
