import { describe, expect, it } from 'vitest'
import {
  COUNTRY_DESTINATION_KEYS,
  resolveCountryDestination,
} from './schema/places'

describe('country destinations', () => {
  it('exposes the closed parser vocabulary', () => {
    expect(COUNTRY_DESTINATION_KEYS).toEqual([
      'Japan',
      'United Kingdom',
      'France',
      'Germany',
      'Spain',
      'Italy',
      'Netherlands',
      'Switzerland',
      'Portugal',
      'Ireland',
      'Denmark',
      'Sweden',
      'Austria',
      'Greece',
      'Turkey',
    ])
  })

  it('resolves each country through its primary city and registry order', () => {
    const expected = {
      Japan: { iata: 'NRT', city: 'Tokyo' },
      'United Kingdom': { iata: 'LHR', city: 'London' },
      France: { iata: 'CDG', city: 'Paris' },
      Germany: { iata: 'BER', city: 'Berlin' },
      Spain: { iata: 'MAD', city: 'Madrid' },
      Italy: { iata: 'FCO', city: 'Rome' },
      Netherlands: { iata: 'AMS', city: 'Amsterdam' },
      Switzerland: { iata: 'ZRH', city: 'Zurich' },
      Portugal: { iata: 'LIS', city: 'Lisbon' },
      Ireland: { iata: 'DUB', city: 'Dublin' },
      Denmark: { iata: 'CPH', city: 'Copenhagen' },
      Sweden: { iata: 'ARN', city: 'Stockholm' },
      Austria: { iata: 'VIE', city: 'Vienna' },
      Greece: { iata: 'ATH', city: 'Athens' },
      Turkey: { iata: 'IST', city: 'Istanbul' },
    }

    for (const [country, place] of Object.entries(expected)) {
      expect(resolveCountryDestination(country), country).toEqual(place)
    }
  })

  it('does not resolve uncovered countries or regions', () => {
    expect(resolveCountryDestination('United States')).toBeNull()
    expect(resolveCountryDestination('Brazil')).toBeNull()
    expect(resolveCountryDestination('Asia')).toBeNull()
    expect(resolveCountryDestination('Europe')).toBeNull()
  })
})
