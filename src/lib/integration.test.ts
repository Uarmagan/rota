import { describe, expect, it } from 'vitest'
import { createSimulatedAvailability } from './availability/provider'
import {
  toAvailabilityQuery,
  type SourceBatch,
} from './availability/types'
import { explainOption } from './engine/explain'
import { filterOptions } from './engine/filter'
import { fillAssumptions, fillDefaults } from './engine/normalize'
import { bestMatch, rankOptions } from './engine/rank'
import type { FlightOption } from './engine/types'
import { createEmptyTripIntent, type TripIntent } from './schema/trip-intent'

const SOURCES = ['meridian', 'aurora', 'zephyr', 'vantage'] as const
const instantDelay = () => Promise.resolve()

const intent = fillDefaults(
  fillAssumptions(
    {
      ...createEmptyTripIntent(),
      destination: { iata: 'NRT', city: 'Tokyo' },
      cabin: 'business',
      travelers: 2,
      dates: {
        earliest: '2027-02-01',
        latest: '2027-02-28',
        flexibility: 'flexible',
      },
      constraints: {
        nonstop: 'preferred',
        arriveBy: null,
        departAfter: null,
        avoidRedeye: null,
        avoidLateArrival: true,
      },
    },
    { defaultOrigin: { iata: 'ORD', city: 'Chicago' } },
  ),
)

describe('availability to explanation integration', () => {
  it('emits complete, sequential batch streams for every source', async () => {
    const batches = await search(intent)

    expect(new Set(batches.map(({ source }) => source))).toEqual(
      new Set(SOURCES),
    )
    for (const source of SOURCES) {
      const sourceBatches = batches.filter((batch) => batch.source === source)
      expect(sourceBatches.map(({ batchIndex }) => batchIndex)).toEqual(
        sourceBatches.map((_, index) => index),
      )
      expect(sourceBatches.filter(({ isFinal }) => isFinal)).toHaveLength(1)
      expect(sourceBatches.at(-1)?.isFinal).toBe(true)
    }
  })

  it('honors the engine generator contract across the seam', async () => {
    const options = allOptions(await search(intent))

    expect(() => filterOptions(intent, options)).not.toThrow()
  })

  it('composes generated inventory through active filters', async () => {
    const generated = allOptions(await search(intent))
    const filtered = filterOptions(intent, generated)
    const generatedIds = new Set(generated.map(({ id }) => id))

    expect(generated.length).toBeGreaterThan(0)
    expect(filtered.length).toBeGreaterThan(0)
    for (const option of filtered) {
      expect(option.cabin).toBe('business')
      expect(finalArrivalTime(option) >= '05:00').toBe(true)
      expect(generatedIds.has(option.id)).toBe(true)
    }
  })

  it('keeps ranking and explanation facts coherent', async () => {
    const filtered = filterOptions(intent, allOptions(await search(intent)))
    const ranked = rankOptions(intent, filtered)
    const best = bestMatch(ranked)

    expect(best).toBe(ranked[0]?.option)
    if (best === null) throw new Error('Expected a best match')

    const facts = explainOption(intent, filtered, best.id)
    expect(facts.isBestMatch).toBe(true)
    expect(facts.price.totalUsd).toBe(2 * best.pricing.priceUsd)
    if (facts.isCheapest) expect(facts.vsCheapest).toBeNull()
    if (facts.isFastest) expect(facts.vsFastest).toBeNull()
    if (facts.vsCheapest !== null) {
      expect(facts.vsCheapest.totalUsdDelta).toBeGreaterThan(0)
    }
  })

  it('replays the same full search with a fresh provider', async () => {
    const first = await search(intent)
    const second = await search(intent)

    expect(second).toEqual(first)
  })

  it('limits a party of nine to stable economy inventory', async () => {
    const travelersTwoOptions = allOptions(await search(intent))
    const partyIntent: TripIntent = {
      ...intent,
      travelers: 9,
      cabin: 'economy',
    }
    const generated = allOptions(await search(partyIntent))
    const surviving = filterOptions(partyIntent, generated)
    const travelersTwoIds = new Set(travelersTwoOptions.map(({ id }) => id))

    expect(generated.length).toBeGreaterThan(0)
    expect(generated.every(({ cabin }) => cabin === 'economy')).toBe(true)
    expect(surviving.every(({ id }) => travelersTwoIds.has(id))).toBe(true)
  })
})

async function search(intentToSearch: TripIntent): Promise<SourceBatch[]> {
  const provider = createSimulatedAvailability({ delay: instantDelay })
  const batches: SourceBatch[] = []
  for await (const batch of provider.search(toAvailabilityQuery(intentToSearch))) {
    batches.push(batch)
  }
  return batches
}

function allOptions(batches: readonly SourceBatch[]): FlightOption[] {
  return batches.flatMap(({ options }) => options)
}

function finalArrivalTime(option: FlightOption): string {
  return option.segments.at(-1)!.arriveLocal.slice(11, 16)
}
