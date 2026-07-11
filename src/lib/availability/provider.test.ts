import { describe, expect, it } from 'vitest'
import {
  createSimulatedAvailability,
  DEFAULT_BASE_SEED,
  planAvailability,
} from './provider'
import type { AvailabilityQuery } from './types'

const QUERIES = [
  {
    origin: 'ORD',
    destination: 'NRT',
    dates: {
      earliest: '2027-02-01',
      latest: '2027-02-28',
      flexibility: 'flexible',
    },
    travelers: 2,
  },
  {
    origin: 'SFO',
    destination: 'LHR',
    dates: {
      earliest: '2027-03-12',
      latest: '2027-03-12',
      flexibility: 'exact',
    },
    travelers: 1,
  },
  {
    origin: 'ORD',
    destination: 'LIS',
    dates: {
      earliest: '2027-04-10',
      latest: '2027-04-14',
      flexibility: 'flexible',
    },
    travelers: 4,
  },
] as const satisfies readonly AvailabilityQuery[]

describe('planAvailability', () => {
  it('replays identical plans and changes inventory with route or dates', () => {
    const baseline = planAvailability(QUERIES[0])

    expect(planAvailability(QUERIES[0])).toEqual(baseline)
    expect(
      planAvailability({ ...QUERIES[0], origin: 'SFO' }),
    ).not.toEqual(baseline)
    expect(
      planAvailability({
        ...QUERIES[0],
        dates: {
          earliest: '2027-03-01',
          latest: '2027-03-31',
          flexibility: 'flexible',
        },
      }),
    ).not.toEqual(baseline)
  })

  it('orders all batches by their cumulative scheduled time', () => {
    for (const query of QUERIES) {
      const plan = planAvailability(query)
      expect(plan.map(({ atMs }) => atMs)).toEqual(
        [...plan].map(({ atMs }) => atMs).sort((left, right) => left - right),
      )
    }
  })

  it('keeps first and final batches inside the latency budget', () => {
    for (const query of QUERIES) {
      const plan = planAvailability(query)
      expect(plan[0]?.source).toBe('meridian')
      expect(plan[0]?.atMs).toBeLessThanOrEqual(600)
      expect(plan.at(-1)?.atMs).toBeLessThanOrEqual(2800)
    }
  })

  it('numbers each source batches from zero and marks exactly one final batch', () => {
    for (const query of QUERIES) {
      const plan = planAvailability(query)
      for (const source of ['meridian', 'aurora', 'zephyr', 'vantage']) {
        const batches = plan.filter((batch) => batch.source === source)
        expect(batches.map(({ batchIndex }) => batchIndex)).toEqual(
          batches.map((_, index) => index),
        )
        expect(batches.filter(({ isFinal }) => isFinal)).toHaveLength(1)
      }
    }
  })

  it('emits final empty batches when a route has no valid shape', () => {
    const plan = planAvailability({
      ...QUERIES[0]!,
      destination: 'ORD',
    })

    expect(plan.every(({ options }) => options.length === 0)).toBe(true)
    expect(plan).toHaveLength(4)
    expect(plan.every(({ batchIndex }) => batchIndex === 0)).toBe(true)
    expect(plan.filter(({ isFinal }) => isFinal)).toHaveLength(4)
  })
})

describe('createSimulatedAvailability', () => {
  it('streams the plan in order using only successive scheduled delay gaps', async () => {
    const recorded: number[] = []
    const provider = createSimulatedAvailability({
      baseSeed: DEFAULT_BASE_SEED,
      delay: (ms) => {
        recorded.push(ms)
        return Promise.resolve()
      },
    })
    const query = QUERIES[0]
    const plan = planAvailability(query)
    const streamed = []

    for await (const batch of provider.search(query)) streamed.push(batch)

    expect(streamed).toEqual(
      plan.map(({ atMs: _atMs, ...batch }) => batch),
    )
    expect(recorded).toEqual(
      plan.map(({ atMs }, index) => atMs - (plan[index - 1]?.atMs ?? 0)),
    )
  })
})
