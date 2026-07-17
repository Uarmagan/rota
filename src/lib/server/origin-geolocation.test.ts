import { describe, expect, it } from 'vitest'
import type { Place } from '../schema/trip-intent'
import {
  normalizeConfigFromGeoHeaders,
  resolveOriginFromCoordinates,
} from './origin-geolocation'

const chicago: Place = { iata: 'ORD', city: 'Chicago' }

describe('origin geolocation', () => {
  it('snaps a point nearest Midway to Chicago\'s primary airport', () => {
    expect(resolveOriginFromCoordinates(41.79, -87.75)).toEqual({
      iata: 'ORD',
      city: 'Chicago',
    })
  })

  it('resolves an Osaka-area point to Kansai', () => {
    expect(resolveOriginFromCoordinates(34.69, 135.5)).toEqual({
      iata: 'KIX',
      city: 'Osaka',
    })
  })

  it('uses the nearest supported hub with no distance cap', () => {
    expect(resolveOriginFromCoordinates(41.26, -95.93)).toEqual({
      iata: 'ORD',
      city: 'Chicago',
    })
  })

  it('falls back to Chicago when geolocation headers are missing', () => {
    expect(normalizeConfigFromGeoHeaders(new Headers(), chicago)).toEqual({
      defaultOrigin: chicago,
    })
  })

  it('builds a config from valid geolocation headers', () => {
    const headers = new Headers({
      'x-vercel-ip-latitude': '34.69',
      'x-vercel-ip-longitude': '135.50',
    })

    expect(normalizeConfigFromGeoHeaders(headers, chicago)).toEqual({
      defaultOrigin: { iata: 'KIX', city: 'Osaka' },
    })
  })

  it.each([
    ['missing latitude', { 'x-vercel-ip-longitude': '135.50' }],
    ['missing longitude', { 'x-vercel-ip-latitude': '34.69' }],
    [
      'malformed latitude',
      {
        'x-vercel-ip-latitude': '34.69north',
        'x-vercel-ip-longitude': '135.50',
      },
    ],
    [
      'non-finite longitude',
      {
        'x-vercel-ip-latitude': '34.69',
        'x-vercel-ip-longitude': 'Infinity',
      },
    ],
    [
      'out-of-range latitude',
      {
        'x-vercel-ip-latitude': '90.01',
        'x-vercel-ip-longitude': '135.50',
      },
    ],
    [
      'out-of-range longitude',
      {
        'x-vercel-ip-latitude': '34.69',
        'x-vercel-ip-longitude': '-180.01',
      },
    ],
  ])('falls back to Chicago for %s', (_label, values) => {
    expect(normalizeConfigFromGeoHeaders(new Headers(values), chicago)).toEqual({
      defaultOrigin: chicago,
    })
  })
})
