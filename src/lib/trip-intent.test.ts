import { describe, expect, it } from 'vitest'
import {
  createEmptyTripIntent,
  parseResultSchema,
  tripIntentSchema,
} from './schema/trip-intent'

describe('destination schema', () => {
  it('accepts a closed-list country before engine resolution', () => {
    const intent = {
      ...createEmptyTripIntent(),
      destination: { country: 'Japan' },
    }
    expect(tripIntentSchema.safeParse(intent).success).toBe(true)
  })

  it('requires an assumed flag on a resolved place destination', () => {
    const resolved = {
      ...createEmptyTripIntent(),
      destination: { iata: 'NRT', city: 'Tokyo', assumed: true },
    }
    const missingFlag = {
      ...createEmptyTripIntent(),
      destination: { iata: 'NRT', city: 'Tokyo' },
    }

    expect(tripIntentSchema.safeParse(resolved).success).toBe(true)
    expect(tripIntentSchema.safeParse(missingFlag).success).toBe(false)
  })

  it('rejects a country outside the registry vocabulary', () => {
    const intent = {
      ...createEmptyTripIntent(),
      destination: { country: 'Brazil' },
    }
    expect(tripIntentSchema.safeParse(intent).success).toBe(false)
  })
})

describe('parser output schema', () => {
  it.each([
    ['origin', 'a'.repeat(100), true],
    ['origin', '🚀'.repeat(100), true],
    ['origin', '🚀'.repeat(101), false],
    ['destination', 'a'.repeat(100), true],
    ['destination', '🚀'.repeat(100), true],
    ['destination', '🚀'.repeat(101), false],
  ] as const)(
    'bounds the %s city by Unicode code points',
    (field, city, expected) => {
      const place = { iata: 'ORD', city, assumed: false }
      const result = {
        intent: {
          ...createEmptyTripIntent(),
          [field]: place,
        },
        unhandled: null,
      }

      expect(parseResultSchema.safeParse(result).success).toBe(expected)
    },
  )

  it('rejects an origin city over 100 Unicode code points', () => {
    const result = {
      intent: {
        ...createEmptyTripIntent(),
        origin: {
          iata: 'ORD',
          city: 'a'.repeat(101),
          assumed: false,
        },
      },
      unhandled: null,
    }

    expect(parseResultSchema.safeParse(result).success).toBe(false)
  })

  it('rejects a resolved destination city over 100 Unicode code points', () => {
    const result = {
      intent: {
        ...createEmptyTripIntent(),
        destination: {
          iata: 'NRT',
          city: 'a'.repeat(101),
          assumed: false,
        },
      },
      unhandled: null,
    }

    expect(parseResultSchema.safeParse(result).success).toBe(false)
  })

  it('rejects unhandled text over 500 Unicode code points', () => {
    const result = {
      intent: createEmptyTripIntent(),
      unhandled: 'a'.repeat(501),
    }

    expect(parseResultSchema.safeParse(result).success).toBe(false)
  })

  it.each([
    ['a'.repeat(500), true],
    ['🚀'.repeat(500), true],
    ['🚀'.repeat(501), false],
  ] as const)('bounds unhandled text by Unicode code points', (unhandled, expected) => {
    const result = {
      intent: createEmptyTripIntent(),
      unhandled,
    }

    expect(parseResultSchema.safeParse(result).success).toBe(expected)
  })
})
