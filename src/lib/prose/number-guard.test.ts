import { describe, expect, it } from 'vitest'
import type { ExplanationFacts } from '../engine/types'
import { fallbackLine } from './render'
import { checkNumberProvenance } from './number-guard'

const facts: ExplanationFacts = {
  optionId: 'option-1',
  stops: 1,
  totalDurationMinutes: 815,
  price: {
    totalMiles: 145000,
    totalFeesUsd: 96,
    program: 'Meridian Elite',
  },
  isBestMatch: true,
  isCheapest: false,
  isFastest: false,
  arriveBy: '18:00',
  nonstopRequired: false,
  vsCheapest: {
    stopsDelta: 1,
    durationDeltaMinutes: 130,
    arrivalDeltaMinutes: -360,
    totalMilesDelta: 8000,
  },
  vsFastest: null,
}

describe('checkNumberProvenance', () => {
  it.each([
    'Costs 145,000 miles.',
    'A 13h 35m trip.',
    'One more stop.',
    'Arrives by 18:00.',
    'Arrives by 6.',
    'First class and nonstop.',
  ])('accepts engine-derived copy: %s', (copy) => {
    expect(checkNumberProvenance(copy, facts)).toEqual({ ok: true })
  })

  it.each([
    '40% cheaper.',
    'About 14 hours.',
    'Saves sixty-two thousand miles.',
    'A couple of stops.',
  ])('rejects non-derived copy: %s', (copy) => {
    expect(checkNumberProvenance(copy, facts).ok).toBe(false)
  })

  it('rejects a foreign number even when its unit sounds plausible', () => {
    expect(
      checkNumberProvenance('A 2 day trip.', { ...facts, vsCheapest: null }).ok,
    ).toBe(false)
  })

  it('keeps deterministic fallbacks guard-clean', () => {
    const fixtures: ExplanationFacts[] = [
      facts,
      { ...facts, stops: 0, totalDurationMinutes: 45, arriveBy: null },
      {
        ...facts,
        isBestMatch: false,
        isCheapest: true,
        totalDurationMinutes: 780,
        price: { ...facts.price, totalMiles: 98000, totalFeesUsd: 112 },
      },
    ]

    for (const fixture of fixtures) {
      expect(checkNumberProvenance(fallbackLine(fixture), fixture)).toEqual({
        ok: true,
      })
    }
  })
})
