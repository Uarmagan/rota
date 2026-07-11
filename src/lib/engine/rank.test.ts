import { describe, expect, it } from 'vitest'
import { bestMatch, rankOptions, scoreOption } from './rank'
import { makeIntent, makeOption } from './test-support'

function makeScoringPair() {
  const faster = makeOption({
    id: 'faster',
    totalDurationMinutes: 660,
    pricing: {
      baseMiles: 80_000,
      feesUsd: 50,
      program: 'Aurora Miles',
    },
  })
  const cheaper = makeOption({
    id: 'cheaper',
    segments: [
      {
        from: 'SFO',
        to: 'LAX',
        departLocal: '2027-02-10T10:00',
        arriveLocal: '2027-02-10T11:30',
      },
      {
        from: 'LAX',
        to: 'NRT',
        departLocal: '2027-02-10T13:00',
        arriveLocal: '2027-02-11T17:00',
      },
    ],
    totalDurationMinutes: 960,
    pricing: {
      baseMiles: 55_000,
      feesUsd: 25,
      program: 'Aurora Miles',
    },
  })

  return { faster, cheaper }
}

describe('rankOptions priority weighting', () => {
  it('reweights price or duration without dropping options', () => {
    const { faster, cheaper } = makeScoringPair()
    const options = [cheaper, faster]
    const base = rankOptions(makeIntent(), options)
    const cheapest = rankOptions(makeIntent({ priority: 'cheapest' }), options)
    const fastest = rankOptions(makeIntent({ priority: 'fastest' }), options)

    expect(base.map(({ option }) => option.id)).toEqual(['faster', 'cheaper'])
    expect(base[0].score).toBeCloseTo(13.9)
    expect(base[1].score).toBeCloseTo(14.7)
    expect(cheapest.map(({ option }) => option.id)).toEqual([
      'cheaper',
      'faster',
    ])
    expect(cheapest[0].score).toBeCloseTo(26.1)
    expect(cheapest[1].score).toBeCloseTo(30.7)
    expect(fastest.map(({ option }) => option.id)).toEqual([
      'faster',
      'cheaper',
    ])
    expect(fastest[0].score).toBeCloseTo(24.9)
    expect(fastest[1].score).toBeCloseTo(30.7)
    expect(base).toHaveLength(options.length)
    expect(cheapest).toHaveLength(options.length)
    expect(fastest).toHaveLength(options.length)
  })
})

describe('nonstop preference', () => {
  it('adds a fixed penalty to connections without dropping them', () => {
    const { faster, cheaper } = makeScoringPair()
    const intent = makeIntent({
      constraints: {
        nonstop: 'preferred',
        arriveBy: null,
        departAfter: null,
        avoidRedeye: null,
        avoidLateArrival: null,
      },
    })

    expect(scoreOption(intent, cheaper)).toBeCloseTo(16.7)
    expect(scoreOption(intent, faster)).toBeCloseTo(13.9)
    expect(rankOptions(intent, [cheaper, faster])).toHaveLength(2)
  })
})

describe('rank tie-breaking and best match', () => {
  it('orders equal scores by ascending code-unit id', () => {
    const later = makeOption({ id: 'z-option' })
    const earlier = makeOption({ id: 'A-option' })

    expect(
      rankOptions(makeIntent(), [later, earlier]).map(({ option }) => option.id),
    ).toEqual(['A-option', 'z-option'])
  })

  it('returns the first ranked option or null for an empty set', () => {
    const option = makeOption()

    expect(bestMatch(rankOptions(makeIntent(), [option]))).toBe(option)
    expect(bestMatch([])).toBeNull()
  })
})

describe('incremental batch stability', () => {
  it('is permutation-invariant and matches ranking merged batches', () => {
    const { faster, cheaper } = makeScoringPair()
    const mid = makeOption({
      id: 'mid',
      totalDurationMinutes: 720,
      pricing: {
        baseMiles: 70_000,
        feesUsd: 25,
        program: 'Aurora Miles',
      },
    })
    const slow = makeOption({
      id: 'slow',
      totalDurationMinutes: 1_200,
      pricing: {
        baseMiles: 90_000,
        feesUsd: 50,
        program: 'Aurora Miles',
      },
    })
    const intent = makeIntent()
    const batchA = [cheaper, slow]
    const batchB = [faster, mid]
    const union = [...batchA, ...batchB]
    const fullRanking = rankOptions(intent, union)

    expect(rankOptions(intent, [...union].reverse())).toEqual(fullRanking)

    const initiallyRanked = rankOptions(intent, batchA).map(
      ({ option }) => option,
    )
    expect(rankOptions(intent, [...initiallyRanked, ...batchB])).toEqual(
      fullRanking,
    )

    const initialIds = initiallyRanked.map(({ id }) => id)
    const mergedInitialIds = fullRanking
      .map(({ option }) => option.id)
      .filter((id) => initialIds.includes(id))
    expect(mergedInitialIds).toEqual(initialIds)
  })
})
