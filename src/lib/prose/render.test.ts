import { describe, expect, it } from 'vitest'
import type { ExplanationFacts } from '../engine/types'
import {
  fallbackLine,
  formatDuration,
  formatMiles,
  renderComparison,
  renderFacts,
} from './render'

const facts: ExplanationFacts = {
  optionId: 'option-1',
  stops: 0,
  totalDurationMinutes: 815,
  price: {
    totalMiles: 145000,
    totalFeesUsd: 96,
    program: 'Meridian Elite',
  },
  isBestMatch: true,
  isCheapest: false,
  isFastest: false,
  arriveBy: null,
  nonstopRequired: false,
  vsCheapest: null,
  vsFastest: null,
}

describe('prose renderers', () => {
  it('formats durations without empty units', () => {
    expect(formatDuration(780)).toBe('13h')
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(815)).toBe('13h 35m')
  })

  it('groups miles for display', () => {
    expect(formatMiles(145000)).toBe('145,000')
  })

  it('renders comparison signs in both directions', () => {
    expect(
      renderComparison({
        stopsDelta: 1,
        durationDeltaMinutes: 130,
        arrivalDeltaMinutes: -360,
        totalMilesDelta: 8000,
      }),
    ).toBe('1 more stop; 2h 10m slower; arrives 6h earlier; 8,000 more miles')
    expect(
      renderComparison({
        stopsDelta: -2,
        durationDeltaMinutes: -45,
        arrivalDeltaMinutes: 15,
        totalMilesDelta: -12000,
      }),
    ).toBe('2 fewer stops; 45m faster; arrives 15m later; 12,000 fewer miles')
  })

  it('omits null and false fact lines', () => {
    expect(renderFacts(facts)).toBe(
      [
        'stops: nonstop',
        'duration: 13h 35m',
        'price: 145,000 miles + $96 (Meridian Elite)',
        'badges: best match',
      ].join('\n'),
    )
  })

  it('renders all present fact lines', () => {
    expect(
      renderFacts({
        ...facts,
        stops: 1,
        isCheapest: true,
        isFastest: true,
        arriveBy: '17:00',
        nonstopRequired: true,
        vsCheapest: {
          stopsDelta: 0,
          durationDeltaMinutes: 0,
          arrivalDeltaMinutes: 0,
          totalMilesDelta: 0,
        },
      }),
    ).toContain(
      'badges: best match, cheapest, fastest\narrive-by deadline: 17:00\nnonstop required: yes\nvs cheapest: same stops; same duration; arrives at the same time; same miles',
    )
  })

  it('renders exact deterministic fallback lines', () => {
    expect(fallbackLine(facts)).toBe(
      'Best match for your search. Nonstop, 13h 35m, 145,000 miles + $96.',
    )
    expect(
      fallbackLine({
        ...facts,
        stops: 1,
        isBestMatch: false,
        isCheapest: true,
      }),
    ).toBe(
      'The cheapest option in this set. 1 stop, 13h 35m, 145,000 miles + $96.',
    )
  })
})
