import { describe, expect, it } from 'vitest'
import { createEmptyTripIntent } from '../schema/trip-intent'
import {
  canonicalizePlaces,
  fillDefaults,
  fillAssumptions,
  UnknownPlaceError,
} from './normalize'

const config = { defaultOrigin: { iata: 'ORD', city: 'Chicago' } }

describe('canonicalizePlaces', () => {
  it('replaces model-authored city labels with registry entries', () => {
    const intent = {
      ...createEmptyTripIntent(),
      origin: { iata: 'ORD', city: 'Chicago, IL', assumed: false },
      destination: { iata: 'NRT', city: 'Tokyo, Japan', assumed: true },
    }
    const result = canonicalizePlaces(intent)
    expect(result.origin).toEqual({ iata: 'ORD', city: 'Chicago', assumed: false })
    expect(result.destination).toEqual({
      iata: 'NRT',
      city: 'Tokyo',
      assumed: true,
    })
  })

  it('preserves the assumed flag through canonicalization', () => {
    const intent = {
      ...createEmptyTripIntent(),
      origin: { iata: 'ORD', city: 'chicago', assumed: true },
    }
    expect(canonicalizePlaces(intent).origin?.assumed).toBe(true)
  })

  it('preserves a country destination for assumption filling', () => {
    const intent = {
      ...createEmptyTripIntent(),
      destination: { country: 'Japan' as const },
    }
    expect(canonicalizePlaces(intent)).toEqual(intent)
  })

  it('passes null places through', () => {
    const empty = createEmptyTripIntent()
    expect(canonicalizePlaces(empty)).toEqual(empty)
  })

  it('rejects IATA codes outside the registry', () => {
    const intent = {
      ...createEmptyTripIntent(),
      destination: { iata: 'XXX', city: 'Nowhere', assumed: false },
    }
    expect(() => canonicalizePlaces(intent)).toThrow(UnknownPlaceError)
  })
})

describe('fillAssumptions', () => {
  it('fills a null origin from config with assumed: true', () => {
    const result = fillAssumptions(createEmptyTripIntent(), config)
    expect(result.origin).toEqual({ iata: 'ORD', city: 'Chicago', assumed: true })
  })

  it('does not touch a stated origin', () => {
    const intent = {
      ...createEmptyTripIntent(),
      origin: { iata: 'SFO', city: 'San Francisco', assumed: false },
    }
    expect(fillAssumptions(intent, config)).toBe(intent)
  })

  it('resolves a country destination to its primary place as assumed', () => {
    const intent = {
      ...createEmptyTripIntent(),
      origin: { iata: 'SFO', city: 'San Francisco', assumed: false },
      destination: { country: 'Japan' as const },
    }
    expect(fillAssumptions(intent, config)).toEqual({
      ...intent,
      destination: { iata: 'NRT', city: 'Tokyo', assumed: true },
    })
  })

  it('fills origin and resolves a country destination in the same pass', () => {
    const intent = {
      ...createEmptyTripIntent(),
      destination: { country: 'Germany' as const },
    }
    expect(fillAssumptions(intent, config)).toEqual({
      ...intent,
      origin: { iata: 'ORD', city: 'Chicago', assumed: true },
      destination: { iata: 'BER', city: 'Berlin', assumed: true },
    })
  })

  it('does not touch a stated destination', () => {
    const intent = {
      ...createEmptyTripIntent(),
      origin: { iata: 'SFO', city: 'San Francisco', assumed: false },
      destination: { iata: 'KIX', city: 'Osaka', assumed: false },
    }
    expect(fillAssumptions(intent, config)).toBe(intent)
  })
})

describe('fillDefaults', () => {
  it('fills null cabin and travelers', () => {
    const result = fillDefaults(createEmptyTripIntent())

    expect(result.cabin).toBe('economy')
    expect(result.travelers).toBe(1)
  })

  it('preserves stated cabin and travelers', () => {
    const intent = {
      ...createEmptyTripIntent(),
      cabin: 'business' as const,
      travelers: 4,
    }

    expect(fillDefaults(intent)).toEqual(intent)
  })

  it('leaves every other field untouched', () => {
    const intent = {
      ...createEmptyTripIntent(),
      destination: { iata: 'NRT', city: 'Tokyo', assumed: false },
      dates: {
        earliest: '2027-02-10',
        latest: '2027-02-14',
        flexibility: 'flexible' as const,
      },
      priority: 'fastest' as const,
      constraints: {
        nonstop: 'preferred' as const,
        arriveBy: '17:00',
        departAfter: '09:00',
        avoidRedeye: false,
        avoidLateArrival: true,
      },
    }

    const result = fillDefaults(intent)

    expect(result).toEqual({
      ...intent,
      cabin: 'economy',
      travelers: 1,
    })
    expect(result.origin).toBeNull()
  })
})
