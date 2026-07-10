import { describe, expect, it } from 'vitest'
import { createEmptyTripIntent, type TripIntent } from '../schema/trip-intent'
import { computeIntentDiff } from './diff'

const base: TripIntent = {
  travelers: 2,
  origin: { iata: 'ORD', city: 'Chicago', assumed: true },
  destination: { iata: 'NRT', city: 'Tokyo' },
  cabin: 'economy',
  dates: { earliest: '2027-02-01', latest: '2027-02-28', flexibility: 'flexible' },
  constraints: {
    nonstop: null,
    arriveBy: null,
    departAfter: null,
    avoidRedeye: null,
    avoidLateArrival: null,
  },
}

describe('computeIntentDiff', () => {
  it('returns empty for identical intents, including distinct but deep-equal objects', () => {
    expect(computeIntentDiff(base, structuredClone(base))).toEqual([])
  })

  it('marks fields going null -> value as set', () => {
    const diff = computeIntentDiff(createEmptyTripIntent(), base)
    expect(diff.map((c) => [c.field, c.kind])).toEqual([
      ['travelers', 'set'],
      ['origin', 'set'],
      ['destination', 'set'],
      ['cabin', 'set'],
      ['dates', 'set'],
    ])
  })

  it('marks value -> different value as changed, with both values carried', () => {
    const next = { ...base, cabin: 'business' as const }
    expect(computeIntentDiff(base, next)).toEqual([
      { field: 'cabin', kind: 'changed', previous: 'economy', next: 'business' },
    ])
  })

  it('marks value -> null as cleared', () => {
    const prev = {
      ...base,
      constraints: { ...base.constraints, nonstop: 'required' as const },
    }
    expect(computeIntentDiff(prev, base)).toEqual([
      { field: 'constraints.nonstop', kind: 'cleared', previous: 'required', next: null },
    ])
  })

  it('treats an assumed-flag flip as a change (the chip label changes)', () => {
    const next = {
      ...base,
      origin: { iata: 'ORD', city: 'Chicago', assumed: false },
    }
    const diff = computeIntentDiff(base, next)
    expect(diff).toHaveLength(1)
    expect(diff[0]).toMatchObject({ field: 'origin', kind: 'changed' })
  })

  it('diffs constraints individually, not as one blob', () => {
    const next = {
      ...base,
      constraints: {
        ...base.constraints,
        departAfter: '09:00',
        avoidLateArrival: true,
      },
    }
    expect(computeIntentDiff(base, next).map((c) => c.field)).toEqual([
      'constraints.departAfter',
      'constraints.avoidLateArrival',
    ])
  })
})
