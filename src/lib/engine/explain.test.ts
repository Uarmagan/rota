import { describe, expect, it } from 'vitest'
import { explainOption } from './explain'
import { makeIntent, makeOption } from './test-support'

function makeComparisonScenario() {
  const cheapest = makeOption({
    id: 'cheapest',
    totalDurationMinutes: 900,
    pricing: {
      baseMiles: 50_000,
      feesUsd: 0,
      program: 'Aurora Miles',
    },
    segments: [
      {
        from: 'SFO',
        to: 'NRT',
        departLocal: '2027-02-10T10:00',
        arriveLocal: '2027-02-11T18:00',
      },
    ],
  })
  const fastest = makeOption({
    id: 'fastest',
    totalDurationMinutes: 600,
    pricing: {
      baseMiles: 60_000,
      feesUsd: 0,
      program: 'Comet Rewards',
    },
    segments: [
      {
        from: 'SFO',
        to: 'LAX',
        departLocal: '2027-02-10T10:00',
        arriveLocal: '2027-02-10T11:00',
      },
      {
        from: 'LAX',
        to: 'NRT',
        departLocal: '2027-02-10T12:00',
        arriveLocal: '2027-02-11T12:00',
      },
    ],
  })
  const intent = makeIntent({
    travelers: 2,
    constraints: {
      nonstop: null,
      arriveBy: '20:00',
      departAfter: null,
      avoidRedeye: null,
      avoidLateArrival: null,
    },
  })

  return { cheapest, fastest, intent }
}

describe('explainOption singleton result set', () => {
  it('marks the only option as every superlative with no comparisons', () => {
    const option = makeOption()

    expect(explainOption(makeIntent(), [option], option.id)).toEqual({
      optionId: 'opt-1',
      stops: 0,
      totalDurationMinutes: 660,
      price: {
        totalMiles: 60_000,
        totalFeesUsd: 40,
        program: 'Aurora Miles',
      },
      isBestMatch: true,
      isCheapest: true,
      isFastest: true,
      arriveBy: null,
      nonstopRequired: false,
      vsCheapest: null,
      vsFastest: null,
    })
  })

  it('rejects an option id outside the current result set', () => {
    expect(() => explainOption(makeIntent(), [makeOption()], 'missing')).toThrow(
      'missing',
    )
  })
})

describe('explainOption result-set comparisons', () => {
  it('describes the fastest-but-not-cheapest best match', () => {
    const { cheapest, fastest, intent } = makeComparisonScenario()

    expect(explainOption(intent, [cheapest, fastest], fastest.id)).toEqual({
      optionId: 'fastest',
      stops: 1,
      totalDurationMinutes: 600,
      price: {
        totalMiles: 120_000,
        totalFeesUsd: 0,
        program: 'Comet Rewards',
      },
      isBestMatch: true,
      isCheapest: false,
      isFastest: true,
      arriveBy: '20:00',
      nonstopRequired: false,
      vsCheapest: {
        stopsDelta: 1,
        durationDeltaMinutes: -300,
        arrivalDeltaMinutes: -360,
        totalMilesDelta: 20_000,
      },
      vsFastest: null,
    })
  })

  it('uses this-minus-reference signs in the opposite direction', () => {
    const { cheapest, fastest, intent } = makeComparisonScenario()

    expect(explainOption(intent, [cheapest, fastest], cheapest.id)).toEqual({
      optionId: 'cheapest',
      stops: 0,
      totalDurationMinutes: 900,
      price: {
        totalMiles: 100_000,
        totalFeesUsd: 0,
        program: 'Aurora Miles',
      },
      isBestMatch: false,
      isCheapest: true,
      isFastest: false,
      arriveBy: '20:00',
      nonstopRequired: false,
      vsCheapest: null,
      vsFastest: {
        stopsDelta: -1,
        durationDeltaMinutes: 300,
        arrivalDeltaMinutes: 360,
        totalMilesDelta: -20_000,
      },
    })
  })

  it('uses ascending id to break a cheapest-price tie', () => {
    const earlier = makeOption({ id: 'a-option' })
    const later = makeOption({ id: 'z-option' })

    expect(
      explainOption(makeIntent(), [later, earlier], later.id).isCheapest,
    ).toBe(false)
    expect(
      explainOption(makeIntent(), [later, earlier], earlier.id).isCheapest,
    ).toBe(true)
  })

  it('carries the active required-nonstop context', () => {
    const option = makeOption()
    const intent = makeIntent({
      constraints: {
        nonstop: 'required',
        arriveBy: null,
        departAfter: null,
        avoidRedeye: null,
        avoidLateArrival: null,
      },
    })

    expect(explainOption(intent, [option], option.id).nonstopRequired).toBe(true)
  })
})
