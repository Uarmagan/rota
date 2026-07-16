// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TripIntent } from '../../lib/schema/trip-intent'
import { loadIntent, saveIntent } from './intent-storage'

const SEARCH_INTENT: TripIntent = {
  travelers: 2,
  origin: { iata: 'ORD', city: 'Chicago', assumed: true },
  destination: { iata: 'NRT', city: 'Tokyo', assumed: false },
  cabin: 'economy',
  dates: {
    earliest: '2027-02-03',
    latest: '2027-02-03',
    flexibility: 'exact',
  },
  priority: null,
  constraints: {
    nonstop: null,
    arriveBy: null,
    departAfter: null,
    avoidRedeye: null,
    avoidLateArrival: null,
  },
}

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('intent storage', () => {
  it('round-trips a committed intent', () => {
    saveIntent(SEARCH_INTENT)

    expect(loadIntent()).toEqual(SEARCH_INTENT)
  })

  it('round-trips a partial committed intent', () => {
    const partial = { ...SEARCH_INTENT, destination: null, dates: null }

    saveIntent(partial)

    expect(loadIntent()).toEqual(partial)
  })

  it('returns null when no committed intent is stored', () => {
    expect(loadIntent()).toBeNull()
  })

  it.each([
    ['corrupt JSON', '{'],
    [
      'too many travelers',
      JSON.stringify({ ...SEARCH_INTENT, travelers: 12 }),
    ],
    [
      'a missing constraints object',
      JSON.stringify({
        travelers: SEARCH_INTENT.travelers,
        origin: SEARCH_INTENT.origin,
        destination: SEARCH_INTENT.destination,
        cabin: SEARCH_INTENT.cabin,
        dates: SEARCH_INTENT.dates,
        priority: SEARCH_INTENT.priority,
      }),
    ],
    [
      'an unknown IATA code',
      JSON.stringify({
        ...SEARCH_INTENT,
        destination: { iata: 'XXX', city: 'Unknown', assumed: false },
      }),
    ],
  ])('returns null for %s', (_case, stored) => {
    sessionStorage.setItem('rota:intent:v1', stored)

    expect(loadIntent()).toBeNull()
  })

  it('restores the registry city label for a known IATA code', () => {
    sessionStorage.setItem(
      'rota:intent:v1',
      JSON.stringify({
        ...SEARCH_INTENT,
        destination: {
          iata: 'NRT',
          city: 'Old Tokyo Label',
          assumed: false,
        },
      }),
    )

    expect(loadIntent()?.destination).toEqual({
      iata: 'NRT',
      city: 'Tokyo',
      assumed: false,
    })
  })

  it('rejects an unresolved country destination', () => {
    sessionStorage.setItem(
      'rota:intent:v1',
      JSON.stringify({
        ...SEARCH_INTENT,
        destination: { country: 'Japan' },
      }),
    )

    expect(loadIntent()).toBeNull()
  })

  it('does not throw when session storage rejects a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable')
    })

    expect(() => saveIntent(SEARCH_INTENT)).not.toThrow()
  })
})
