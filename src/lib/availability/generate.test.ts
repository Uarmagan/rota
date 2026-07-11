import { describe, expect, it } from 'vitest'
import { generateSourceOptions } from './generate'
import { DEFAULT_BASE_SEED } from './provider'
import { SIMULATED_SOURCES } from './sources'
import { UTC_OFFSET_MINUTES } from './time'
import type { AvailabilityQuery } from './types'

const FLEXIBLE_QUERY: AvailabilityQuery = {
  origin: 'ORD',
  destination: 'NRT',
  dates: {
    earliest: '2027-02-01',
    latest: '2027-02-28',
    flexibility: 'flexible',
  },
  travelers: 2,
}

describe('generateSourceOptions', () => {
  it('generates source-prefixed unique option identities', () => {
    const options = allOptions()
    const ids = new Set<string>()

    expect(options.length).toBeGreaterThan(0)
    for (const option of options) {
      expect(option.id.startsWith(`${option.source}-`)).toBe(true)
      expect(ids.has(option.id)).toBe(false)
      ids.add(option.id)
    }
  })

  it('generates chained routes departing inside the requested window', () => {
    for (const option of allOptions()) {
      expect(option.segments[0]?.from).toBe(FLEXIBLE_QUERY.origin)
      expect(option.segments.at(-1)?.to).toBe(FLEXIBLE_QUERY.destination)
      expect(option.segments[0]?.departLocal.slice(0, 10) >= '2027-02-01').toBe(true)
      expect(option.segments[0]?.departLocal.slice(0, 10) <= '2027-02-28').toBe(true)
      for (let index = 1; index < option.segments.length; index += 1) {
        expect(option.segments[index - 1]?.to).toBe(option.segments[index]?.from)
      }
      expect(option.totalDurationMinutes).toBeGreaterThan(0)
    }
  })

  it('generates rounded miles and whole fees inside each source pricing bands', () => {
    for (const option of allOptions()) {
      const source = requiredSource(option.source)
      expect(option.pricing.baseMiles).toBeGreaterThanOrEqual(7500)
      expect(option.pricing.baseMiles % 500).toBe(0)
      expect(Number.isInteger(option.pricing.feesUsd)).toBe(true)
      expect(option.pricing.feesUsd).toBeGreaterThanOrEqual(source.feesUsd[0])
      expect(option.pricing.feesUsd).toBeLessThanOrEqual(source.feesUsd[1])
      expect(option.pricing.program).toBe(source.program)
    }
  })

  it('keeps business and first inventory scarcer than economy', () => {
    const options = allOptions()
    const economy = options.filter(({ cabin }) => cabin === 'economy').length
    const scarcePremium = options.filter(
      ({ cabin }) => cabin === 'business' || cabin === 'first',
    ).length
    expect(scarcePremium).toBeLessThan(economy)
  })

  it('keeps segment times and explicit total duration consistent', () => {
    const options = allOptions()

    for (const option of options) {
      let computedDuration = 0
      for (const [index, segment] of option.segments.entries()) {
        computedDuration +=
          localMinuteDifference(segment.departLocal, segment.arriveLocal) -
          ((UTC_OFFSET_MINUTES[segment.to] ?? 0) -
            (UTC_OFFSET_MINUTES[segment.from] ?? 0))
        const next = option.segments[index + 1]
        if (next !== undefined) {
          computedDuration += localMinuteDifference(segment.arriveLocal, next.departLocal)
        }
      }
      expect(computedDuration).toBe(option.totalDurationMinutes)
    }
  })

  it('preserves option identities while removing inventory that cannot seat the party', () => {
    const solo = SIMULATED_SOURCES.flatMap((source) =>
      generateSourceOptions(
        source,
        { ...FLEXIBLE_QUERY, travelers: 1 },
        DEFAULT_BASE_SEED,
      ),
    )
    const party = SIMULATED_SOURCES.flatMap((source) =>
      generateSourceOptions(
        source,
        { ...FLEXIBLE_QUERY, travelers: 9 },
        DEFAULT_BASE_SEED,
      ),
    )
    const soloIds = new Set(solo.map(({ id }) => id))

    expect(party.length).toBeGreaterThan(0)
    expect(party.every(({ id }) => soloIds.has(id))).toBe(true)
    expect(party.every(({ cabin }) => cabin === 'economy')).toBe(true)
  })
})

function localMinuteDifference(from: string, to: string): number {
  return (localTimestamp(to) - localTimestamp(from)) / 60_000
}

function localTimestamp(value: string): number {
  const [date, time] = value.split('T')
  const [year, month, day] = (date ?? '').split('-').map(Number)
  const [hour, minute] = (time ?? '').split(':').map(Number)
  return Date.UTC(year, month - 1, day, hour, minute)
}

function allOptions() {
  return SIMULATED_SOURCES.flatMap((source) =>
    generateSourceOptions(source, FLEXIBLE_QUERY, DEFAULT_BASE_SEED),
  )
}

function requiredSource(id: string) {
  const source = SIMULATED_SOURCES.find((candidate) => candidate.id === id)
  if (source === undefined) throw new Error(`Unknown test source ${id}`)
  return source
}
