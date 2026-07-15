import { describe, expect, it } from 'vitest'
import { explanationFactsSchema } from './facts-schema'
import type { ExplanationFacts } from './types'

const validFacts: ExplanationFacts = {
  optionId: 'option-1',
  stops: 1,
  totalDurationMinutes: 815,
  price: { totalUsd: 1450 },
  isBestMatch: true,
  isCheapest: false,
  isFastest: false,
  arriveBy: '18:00',
  nonstopRequired: false,
  vsCheapest: {
    stopsDelta: 1,
    durationDeltaMinutes: 130,
    arrivalDeltaMinutes: -360,
    totalUsdDelta: 80,
  },
  vsFastest: null,
}

describe('explanationFactsSchema', () => {
  it('accepts a complete facts object', () => {
    expect(explanationFactsSchema.safeParse(validFacts).success).toBe(true)
  })

  it('rejects an omitted nullable field', () => {
    const { vsFastest: _omitted, ...incomplete } = validFacts

    expect(explanationFactsSchema.safeParse(incomplete).success).toBe(false)
  })

  it('rejects a malformed arrive-by time', () => {
    expect(
      explanationFactsSchema.safeParse({ ...validFacts, arriveBy: '6pm' }).success,
    ).toBe(false)
  })

  it('rejects fractional dollars', () => {
    expect(
      explanationFactsSchema.safeParse({
        ...validFacts,
        price: { ...validFacts.price, totalUsd: 1450.5 },
      }).success,
    ).toBe(false)
  })
})
