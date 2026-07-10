import { describe, expect, it } from 'vitest'
import { createEmptyTripIntent } from '../schema/trip-intent'
import {
  canonicalizePlaces,
  fillAssumptions,
  UnknownPlaceError,
} from './normalize'

const config = { defaultOrigin: { iata: 'ORD', city: 'Chicago' } }

describe('canonicalizePlaces', () => {
  it('replaces model-authored city labels with registry entries', () => {
    const intent = {
      ...createEmptyTripIntent(),
      origin: { iata: 'ORD', city: 'Chicago, IL', assumed: false },
      destination: { iata: 'NRT', city: 'Tokyo, Japan' },
    }
    const result = canonicalizePlaces(intent)
    expect(result.origin).toEqual({ iata: 'ORD', city: 'Chicago', assumed: false })
    expect(result.destination).toEqual({ iata: 'NRT', city: 'Tokyo' })
  })

  it('preserves the assumed flag through canonicalization', () => {
    const intent = {
      ...createEmptyTripIntent(),
      origin: { iata: 'ORD', city: 'chicago', assumed: true },
    }
    expect(canonicalizePlaces(intent).origin?.assumed).toBe(true)
  })

  it('passes null places through', () => {
    const empty = createEmptyTripIntent()
    expect(canonicalizePlaces(empty)).toEqual(empty)
  })

  it('rejects IATA codes outside the registry', () => {
    const intent = {
      ...createEmptyTripIntent(),
      destination: { iata: 'XXX', city: 'Nowhere' },
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
})
