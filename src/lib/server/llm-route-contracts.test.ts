import { describe, expect, it } from 'vitest'
import type { ExplanationFacts } from '../engine/types'
import { createEmptyTripIntent } from '../schema/trip-intent'
import {
  parseExplanationRequest,
  parseIntentRequest,
} from './llm-route-contracts'

const facts: ExplanationFacts = {
  optionId: 'option-1',
  stops: 0,
  totalDurationMinutes: 815,
  price: {
    totalMiles: 145000,
    totalFeesUsd: 96,
    program: 'Meridian Elite',
  },
  isBestMatch: true,
  isCheapest: false,
  isFastest: false,
  arriveBy: null,
  nonstopRequired: false,
  vsCheapest: null,
  vsFastest: null,
}

describe('LLM route transport contracts', () => {
  it('trims and accepts an utterance at 500 Unicode code points', () => {
    const utterance = '🚀'.repeat(500)

    const result = parseIntentRequest({
      currentIntent: createEmptyTripIntent(),
      utterance: `  ${utterance}  `,
    })

    expect(result.success && result.data.utterance).toBe(utterance)
  })

  it('rejects an utterance over 500 Unicode code points', () => {
    expect(
      parseIntentRequest({
        currentIntent: createEmptyTripIntent(),
        utterance: '🚀'.repeat(501),
      }).success,
    ).toBe(false)
  })

  it('accepts city, option, and program labels at 100 Unicode code points', () => {
    const label = '🚀'.repeat(100)
    const intent = {
      ...createEmptyTripIntent(),
      destination: { iata: 'NRT', city: label },
    }

    expect(
      parseIntentRequest({ currentIntent: intent, utterance: 'keep it' }).success,
    ).toBe(true)
    expect(
      parseExplanationRequest({
        facts: {
          ...facts,
          optionId: label,
          price: { ...facts.price, program: label },
        },
      }).success,
    ).toBe(true)
  })

  it('rejects city, option, and program labels over 100 Unicode code points', () => {
    const label = '🚀'.repeat(101)
    const intent = {
      ...createEmptyTripIntent(),
      destination: { iata: 'NRT', city: label },
    }

    expect(
      parseIntentRequest({ currentIntent: intent, utterance: 'keep it' }).success,
    ).toBe(false)
    expect(
      parseExplanationRequest({ facts: { ...facts, optionId: label } }).success,
    ).toBe(false)
    expect(
      parseExplanationRequest({
        facts: { ...facts, price: { ...facts.price, program: label } },
      }).success,
    ).toBe(false)
  })

  it('rejects excessive numeric facts and comparison deltas', () => {
    expect(
      parseExplanationRequest({
        facts: { ...facts, totalDurationMinutes: 10_081 },
      }).success,
    ).toBe(false)
    expect(
      parseExplanationRequest({
        facts: {
          ...facts,
          vsCheapest: {
            stopsDelta: 0,
            durationDeltaMinutes: 0,
            arrivalDeltaMinutes: 0,
            totalMilesDelta: 10_000_001,
          },
        },
      }).success,
    ).toBe(false)
  })
})
