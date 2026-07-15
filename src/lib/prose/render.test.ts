import { describe, expect, it } from 'vitest'
import type { ExplanationFacts } from '../engine/types'
import {
  fallbackLine,
  formatDuration,
  formatUsd,
  renderComparison,
  renderFacts,
} from './render'

const facts: ExplanationFacts = {
  optionId: 'option-1',
  stops: 0,
  totalDurationMinutes: 815,
  price: { totalUsd: 1450 },
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

  it('groups whole-dollar prices for display', () => {
    expect(formatUsd(1450)).toBe('$1,450')
  })

  it('renders comparison signs in both directions', () => {
    expect(
      renderComparison({
        stopsDelta: 1,
        durationDeltaMinutes: 130,
        arrivalDeltaMinutes: -360,
        totalUsdDelta: 80,
      }),
    ).toBe('1 more stop; 2h 10m slower; arrives 6h earlier; $80 more')
    expect(
      renderComparison({
        stopsDelta: -2,
        durationDeltaMinutes: -45,
        arrivalDeltaMinutes: 15,
        totalUsdDelta: -120,
      }),
    ).toBe('2 fewer stops; 45m faster; arrives 15m later; $120 cheaper')
  })

  it('omits null and false fact lines', () => {
    expect(renderFacts(facts)).toBe(
      [
        'stops: nonstop',
        'duration: 13h 35m',
        'price: $1,450 total',
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
          totalUsdDelta: 0,
        },
      }),
    ).toContain(
      'badges: best match, cheapest, fastest\narrive-by deadline: 17:00\nnonstop required: yes\nvs cheapest: same stops; same duration; arrives at the same time; same price',
    )
  })

  it('renders exact deterministic fallback lines', () => {
    expect(fallbackLine(facts)).toBe(
      'Best match for your search. Nonstop, 13h 35m, $1,450 total.',
    )
    expect(
      fallbackLine({
        ...facts,
        stops: 1,
        isBestMatch: false,
        isCheapest: true,
      }),
    ).toBe(
      'The cheapest option in this set. 1 stop, 13h 35m, $1,450 total.',
    )
  })
})
