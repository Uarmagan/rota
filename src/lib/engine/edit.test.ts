import { describe, expect, it } from 'vitest'
import type { TripIntent } from '../schema/trip-intent'
import { computeIntentDiff } from './diff'
import { applyIntentEdit } from './edit'

const base: TripIntent = {
  travelers: 2,
  origin: { iata: 'ORD', city: 'Chicago', assumed: true },
  destination: { iata: 'NRT', city: 'Tokyo' },
  cabin: 'economy',
  dates: {
    earliest: '2027-02-03',
    latest: '2027-02-03',
    flexibility: 'exact',
  },
  priority: 'cheapest',
  constraints: {
    nonstop: 'preferred',
    arriveBy: '17:00',
    departAfter: '09:00',
    avoidRedeye: true,
    avoidLateArrival: false,
  },
}

describe('applyIntentEdit', () => {
  it('sets normalized fields and changes exactly the edited field', () => {
    const cases = [
      [{ field: 'travelers', value: 4 }, 'travelers'],
      [
        { field: 'origin', value: { iata: 'SFO', city: 'San Francisco' } },
        'origin',
      ],
      [
        { field: 'destination', value: { iata: 'LIS', city: 'Lisbon' } },
        'destination',
      ],
      [{ field: 'cabin', value: 'business' }, 'cabin'],
      [
        {
          field: 'dates',
          value: {
            earliest: '2027-03-01',
            latest: '2027-03-08',
            flexibility: 'flexible',
          },
        },
        'dates',
      ],
      [{ field: 'priority', value: 'fastest' }, 'priority'],
      [{ field: 'constraints.nonstop', value: 'required' }, 'constraints.nonstop'],
      [{ field: 'constraints.arriveBy', value: '19:30' }, 'constraints.arriveBy'],
      [
        { field: 'constraints.departAfter', value: '10:15' },
        'constraints.departAfter',
      ],
      [{ field: 'constraints.avoidRedeye', value: false }, 'constraints.avoidRedeye'],
      [
        { field: 'constraints.avoidLateArrival', value: true },
        'constraints.avoidLateArrival',
      ],
    ] as const

    for (const [edit, expectedField] of cases) {
      const next = applyIntentEdit(base, edit)
      expect(computeIntentDiff(base, next).map(({ field }) => field)).toEqual([
        expectedField,
      ])
    }

    expect(
      applyIntentEdit(base, {
        field: 'origin',
        value: { iata: 'ORD', city: 'Chicago' },
      }).origin,
    ).toEqual({ iata: 'ORD', city: 'Chicago', assumed: false })
  })

  it('clears only removable fields', () => {
    const cases = [
      ['destination', 'destination'],
      ['dates', 'dates'],
      ['priority', 'priority'],
      ['constraints.nonstop', 'constraints.nonstop'],
      ['constraints.arriveBy', 'constraints.arriveBy'],
      ['constraints.departAfter', 'constraints.departAfter'],
      ['constraints.avoidRedeye', 'constraints.avoidRedeye'],
      ['constraints.avoidLateArrival', 'constraints.avoidLateArrival'],
    ] as const

    for (const [field, expectedField] of cases) {
      const next = applyIntentEdit(base, { field, value: null })
      expect(computeIntentDiff(base, next)).toEqual([
        expect.objectContaining({ field: expectedField, kind: 'cleared', next: null }),
      ])
    }
  })

  it('rejects traveler values outside the normalized browser range', () => {
    expect(() =>
      applyIntentEdit(base, { field: 'travelers', value: 0 }),
    ).toThrow()
    expect(() =>
      applyIntentEdit(base, { field: 'travelers', value: 10 }),
    ).toThrow()
  })

  it('rejects invalid exact dates and reversed flexible windows', () => {
    expect(() =>
      applyIntentEdit(base, {
        field: 'dates',
        value: {
          earliest: '2027-03-01',
          latest: '2027-03-02',
          flexibility: 'exact',
        },
      }),
    ).toThrow()
    expect(() =>
      applyIntentEdit(base, {
        field: 'dates',
        value: {
          earliest: '2027-03-08',
          latest: '2027-03-01',
          flexibility: 'flexible',
        },
      }),
    ).toThrow()
  })
})
