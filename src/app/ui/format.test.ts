import { describe, expect, it } from 'vitest'
import type { FlightOption } from '../../lib/engine/types'
import { createEmptyTripIntent, type TripIntent } from '../../lib/schema/trip-intent'
import {
  airlineLabel,
  arrivalDayOffset,
  chipsFromIntent,
  formatDateWindow,
  formatDuration,
  layoverMinutes,
  stopsLabel,
} from './format'

const OPTION: FlightOption = {
  id: 'src-001',
  source: 'meridian',
  cabin: 'business',
  segments: [
    { from: 'ORD', to: 'SFO', departLocal: '2027-02-03T08:20', arriveLocal: '2027-02-03T10:55', flight: 'UA 101' },
    { from: 'SFO', to: 'NRT', departLocal: '2027-02-03T13:10', arriveLocal: '2027-02-04T17:25', flight: 'NH 202' },
  ],
  totalDurationMinutes: 965,
  pricing: { priceUsd: 725 },
}

describe('formatDateWindow', () => {
  it('renders a full flexible month compactly', () => {
    expect(
      formatDateWindow({ earliest: '2027-02-01', latest: '2027-02-28', flexibility: 'flexible' }),
    ).toBe('Feb 2027')
  })

  it('renders an exact day', () => {
    expect(
      formatDateWindow({ earliest: '2026-09-14', latest: '2026-09-14', flexibility: 'exact' }),
    ).toBe('Sep 14, 2026')
  })

  it('renders a partial-month and a cross-month window', () => {
    expect(
      formatDateWindow({ earliest: '2026-09-10', latest: '2026-09-20', flexibility: 'flexible' }),
    ).toBe('Sep 10 – 20, 2026')
    expect(
      formatDateWindow({ earliest: '2026-09-28', latest: '2026-10-04', flexibility: 'flexible' }),
    ).toBe('Sep 28 – Oct 4, 2026')
  })
})

describe('formatDuration', () => {
  it('handles hour/minute combinations', () => {
    expect(formatDuration(965)).toBe('16h 5m')
    expect(formatDuration(720)).toBe('12h')
    expect(formatDuration(45)).toBe('45m')
  })
})

describe('option display helpers', () => {
  it('computes the arrival day offset from local dates', () => {
    expect(arrivalDayOffset(OPTION)).toBe(1)
  })

  it('labels stops with the connection airports', () => {
    expect(stopsLabel(OPTION)).toBe('1 stop · SFO')
    expect(stopsLabel({ ...OPTION, segments: [OPTION.segments[1]] })).toBe('nonstop')
  })

  it('names airlines from segment flight codes, deduplicated', () => {
    expect(airlineLabel(OPTION)).toBe('United · ANA')
    expect(airlineLabel({ ...OPTION, segments: [OPTION.segments[0]] })).toBe('United')
  })

  it('computes layover minutes at the shared connection airport', () => {
    expect(layoverMinutes('2027-02-03T10:55', '2027-02-03T13:10')).toBe(135)
    expect(layoverMinutes('2027-02-03T22:40', '2027-02-04T01:10')).toBe(150)
  })
})

describe('chipsFromIntent', () => {
  const intent: TripIntent = {
    travelers: 2,
    origin: { iata: 'ORD', city: 'Chicago', assumed: true },
    destination: { iata: 'NRT', city: 'Tokyo', assumed: true },
    cabin: 'premium_economy',
    dates: { earliest: '2027-02-01', latest: '2027-02-28', flexibility: 'flexible' },
    priority: 'cheapest',
    constraints: {
      nonstop: 'preferred',
      arriveBy: null,
      departAfter: null,
      avoidRedeye: null,
      avoidLateArrival: false,
    },
  }

  it('renders one chip per non-null field with readable values', () => {
    const chips = chipsFromIntent(intent)
    expect(chips.map((chip) => [chip.field, chip.value])).toEqual([
      ['travelers', '2'],
      ['origin', 'ORD · Chicago'],
      ['destination', 'NRT · Tokyo'],
      ['dates', 'Feb 2027'],
      ['cabin', 'premium economy'],
      ['priority', 'cheapest first'],
      ['constraints.nonstop', 'preferred'],
      ['constraints.avoidLateArrival', 'fine'],
    ])
    expect(chips.find((chip) => chip.field === 'origin')?.assumed).toBe(true)
    expect(chips.find((chip) => chip.field === 'destination')?.assumed).toBe(true)
  })

  it('renders nothing for an empty intent', () => {
    expect(chipsFromIntent(createEmptyTripIntent())).toEqual([])
  })
})
